#define _POSIX_C_SOURCE 200809L

#include <arpa/inet.h>
#include <pthread.h>
#include <signal.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>

#include <srt/srt.h>

enum { PAYLOAD_SIZE = 1316, STREAM_ID_SIZE = 512 };

typedef struct {
  SRTSOCKET group;
  char client[INET_ADDRSTRLEN];
} session_args;

static atomic_bool running = true;
static atomic_int sessions = 0;
static int max_groups = 64;
static int max_links = 2;
static int idle_timeout_ms = 15000;

static int env_int(const char *name, int fallback, int minimum, int maximum) {
  const char *value = getenv(name);
  if (!value || !*value)
    return fallback;
  char *end = NULL;
  const long parsed = strtol(value, &end, 10);
  if (*end || parsed < minimum || parsed > maximum) {
    fprintf(stderr, "Invalid %s; expected %d..%d\n", name, minimum, maximum);
    exit(2);
  }
  return (int)parsed;
}

static void stop_service(int signal_number) {
  (void)signal_number;
  running = false;
}

static SRTSOCKET connect_mediamtx(const char *stream_id) {
  SRTSOCKET socket = srt_create_socket();
  if (socket == SRT_INVALID_SOCK)
    return SRT_INVALID_SOCK;
  int live = SRTT_LIVE;
  int message_api = 1;
  int payload = PAYLOAD_SIZE;
  if (srt_setsockflag(socket, SRTO_TRANSTYPE, &live, sizeof(live)) ==
          SRT_ERROR ||
      srt_setsockflag(socket, SRTO_MESSAGEAPI, &message_api,
                      sizeof(message_api)) == SRT_ERROR ||
      srt_setsockflag(socket, SRTO_PAYLOADSIZE, &payload, sizeof(payload)) ==
          SRT_ERROR ||
      srt_setsockflag(socket, SRTO_STREAMID, stream_id,
                      (int)strlen(stream_id)) == SRT_ERROR) {
    srt_close(socket);
    return SRT_INVALID_SOCK;
  }
  struct sockaddr_in target = {
      .sin_family = AF_INET,
      .sin_port = htons(8890),
  };
  inet_pton(AF_INET, "127.0.0.1", &target.sin_addr);
  if (srt_connect(socket, (const struct sockaddr *)&target, sizeof(target)) ==
      SRT_ERROR) {
    srt_close(socket);
    return SRT_INVALID_SOCK;
  }
  return socket;
}

static size_t group_links(SRTSOCKET group) {
  size_t count = 0;
  return srt_group_data(group, NULL, &count) == SRT_ERROR ? 0 : count;
}

// SRTO_STREAMID cannot be read from a group: the group getter first copies the
// value from the member socket, which shrinks the length argument to the exact
// string length, and then fails its own size check against the NUL-terminated
// copy it keeps. Read the option from the first member instead.
static bool read_stream_id(SRTSOCKET group, char *value, int size) {
  SRTSOCKET source = group;
  size_t count = 0;
  if (srt_group_data(group, NULL, &count) != SRT_ERROR && count > 0) {
    SRT_SOCKGROUPDATA *links = calloc(count, sizeof(*links));
    if (!links)
      return false;
    if (srt_group_data(group, links, &count) != SRT_ERROR && count > 0)
      source = links[0].id;
    free(links);
  }
  int length = size - 1;
  if (srt_getsockflag(source, SRTO_STREAMID, value, &length) == SRT_ERROR ||
      length <= 0)
    return false;
  value[length] = '\0';
  return true;
}

static void log_links(SRTSOCKET group, const char *client) {
  size_t count = 0;
  if (srt_group_data(group, NULL, &count) == SRT_ERROR || !count)
    return;
  SRT_SOCKGROUPDATA *links = calloc(count, sizeof(*links));
  if (!links)
    return;
  if (srt_group_data(group, links, &count) == SRT_ERROR) {
    free(links);
    return;
  }
  for (size_t index = 0; index < count; ++index) {
    SRT_TRACEBSTATS stats = {0};
    if (srt_bstats(links[index].id, &stats, 0) != SRT_ERROR) {
      fprintf(stderr,
              "client=%s group=%d link=%d state=%d rtt_ms=%.0f "
              "send_mbps=%.3f lost=%d\n",
              client, group, links[index].id, links[index].sockstate,
              stats.msRTT, stats.mbpsSendRate, stats.pktSndLoss);
    }
  }
  free(links);
}

static void *serve_session(void *opaque) {
  session_args *args = opaque;
  const SRTSOCKET group = args->group;
  char client[INET_ADDRSTRLEN];
  memcpy(client, args->client, sizeof(client));
  free(args);

  char stream_id[STREAM_ID_SIZE + 1] = {0};
  if (!read_stream_id(group, stream_id, sizeof(stream_id)) ||
      strncmp(stream_id, "publish:", 8) != 0) {
    fprintf(stderr, "client=%s group=%d rejected=invalid-streamid\n", client,
            group);
    srt_close(group);
    --sessions;
    return NULL;
  }
  srt_setsockflag(group, SRTO_RCVTIMEO, &idle_timeout_ms,
                  sizeof(idle_timeout_ms));
  if ((int)group_links(group) > max_links) {
    fprintf(stderr, "client=%s group=%d rejected=too-many-links\n", client,
            group);
    srt_close(group);
    --sessions;
    return NULL;
  }

  SRTSOCKET output = connect_mediamtx(stream_id);
  if (output == SRT_INVALID_SOCK) {
    fprintf(stderr, "client=%s group=%d error=mediamtx-connect\n", client,
            group);
    srt_close(group);
    --sessions;
    return NULL;
  }
  fprintf(stderr, "client=%s group=%d accepted links=%zu\n", client, group,
          group_links(group));

  char buffer[PAYLOAD_SIZE];
  time_t next_log = time(NULL) + 10;
  while (running) {
    const int size = srt_recvmsg(group, buffer, sizeof(buffer));
    if (size <= 0 || srt_sendmsg(output, buffer, size, -1, 0) == SRT_ERROR) {
      break;
    }
    if ((int)group_links(group) > max_links) {
      fprintf(stderr, "client=%s group=%d error=too-many-links\n", client,
              group);
      break;
    }
    const time_t now = time(NULL);
    if (now >= next_log) {
      log_links(group, client);
      next_log = now + 10;
    }
  }
  fprintf(stderr, "client=%s group=%d closed\n", client, group);
  srt_close(output);
  srt_close(group);
  --sessions;
  return NULL;
}

int main(void) {
  max_groups = env_int("VISP_BOND_MAX_GROUPS", 64, 1, 10000);
  max_links = env_int("VISP_BOND_MAX_LINKS", 2, 1, 8);
  idle_timeout_ms = env_int("VISP_BOND_IDLE_TIMEOUT_MS", 15000, 1000, 3600000);
  signal(SIGINT, stop_service);
  signal(SIGTERM, stop_service);
  srt_startup();

  SRTSOCKET listener = srt_create_socket();
  int group_connect = 1;
  int reuse = 1;
  if (listener == SRT_INVALID_SOCK ||
      srt_setsockflag(listener, SRTO_GROUPCONNECT, &group_connect,
                      sizeof(group_connect)) == SRT_ERROR ||
      srt_setsockflag(listener, SRTO_REUSEADDR, &reuse, sizeof(reuse)) ==
          SRT_ERROR) {
    fprintf(stderr, "Failed to create bonding listener: %s\n",
            srt_getlasterror_str());
    return 1;
  }
  struct sockaddr_in address = {
      .sin_family = AF_INET,
      .sin_port = htons(8891),
      .sin_addr = {.s_addr = htonl(INADDR_ANY)},
  };
  if (srt_bind(listener, (const struct sockaddr *)&address, sizeof(address)) ==
          SRT_ERROR ||
      srt_listen(listener, max_groups) == SRT_ERROR) {
    fprintf(stderr, "Failed to listen on UDP 8891: %s\n",
            srt_getlasterror_str());
    srt_close(listener);
    return 1;
  }
  fprintf(stderr,
          "visp-bond listening udp=8891 max_groups=%d max_links=%d "
          "idle_timeout_ms=%d\n",
          max_groups, max_links, idle_timeout_ms);

  while (running) {
    struct sockaddr_in peer = {0};
    int peer_size = sizeof(peer);
    SRTSOCKET group =
        srt_accept(listener, (struct sockaddr *)&peer, &peer_size);
    if (group == SRT_INVALID_SOCK) {
      if (running)
        fprintf(stderr, "Accept failed: %s\n", srt_getlasterror_str());
      continue;
    }
    if (sessions >= max_groups) {
      fprintf(stderr, "Rejected group=%d: session limit reached\n", group);
      srt_close(group);
      continue;
    }
    session_args *args = calloc(1, sizeof(*args));
    if (!args) {
      srt_close(group);
      continue;
    }
    args->group = group;
    inet_ntop(AF_INET, &peer.sin_addr, args->client, sizeof(args->client));
    ++sessions;
    pthread_t thread;
    if (pthread_create(&thread, NULL, serve_session, args) != 0) {
      --sessions;
      free(args);
      srt_close(group);
      continue;
    }
    pthread_detach(thread);
  }

  srt_close(listener);
  while (sessions > 0)
    sleep(1);
  srt_cleanup();
  return 0;
}
