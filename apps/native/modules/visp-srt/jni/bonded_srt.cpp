#include <jni.h>
#include <srt/srt.h>

#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <atomic>
#include <cstring>
#include <mutex>
#include <sstream>
#include <string>
#include <thread>
#include <vector>

namespace {
constexpr int kPayloadSize = 1316;
constexpr int kReceiveBuffer = 4 * 1024 * 1024;

struct ParsedUrl {
  std::string host;
  int port = 0;
  std::string stream_id;
  int latency_ms = 0;
};

struct State {
  std::mutex mutex;
  std::atomic<bool> running{false};
  int udp = -1;
  SRTSOCKET group = SRT_INVALID_SOCK;
  std::thread reader;
  std::vector<std::string> transports;
};

State state;

std::string query_value(const std::string &query, const std::string &name) {
  const std::string prefix = name + "=";
  size_t start = 0;
  while (start <= query.size()) {
    const size_t end = query.find('&', start);
    const std::string item = query.substr(start, end - start);
    if (item.rfind(prefix, 0) == 0)
      return item.substr(prefix.size());
    if (end == std::string::npos)
      break;
    start = end + 1;
  }
  return {};
}

bool parse_url(const std::string &value, ParsedUrl *parsed) {
  constexpr char scheme[] = "srt://";
  if (value.rfind(scheme, 0) != 0)
    return false;
  const size_t query_at = value.find('?');
  const std::string authority =
      value.substr(sizeof(scheme) - 1, query_at - (sizeof(scheme) - 1));
  const size_t colon = authority.rfind(':');
  if (colon == std::string::npos)
    return false;
  parsed->host = authority.substr(0, colon);
  try {
    parsed->port = std::stoi(authority.substr(colon + 1));
  } catch (...) {
    return false;
  }
  const std::string query =
      query_at == std::string::npos ? "" : value.substr(query_at + 1);
  parsed->stream_id = query_value(query, "streamid");
  const std::string latency = query_value(query, "latency");
  if (!latency.empty()) {
    try {
      parsed->latency_ms = std::stoi(latency) / 1000;
    } catch (...) {
      return false;
    }
  }
  return !parsed->host.empty() && parsed->port > 0 && parsed->port <= 65535 &&
         !parsed->stream_id.empty();
}

bool destination(const ParsedUrl &url, sockaddr_storage *address, int *length) {
  addrinfo hints{};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_DGRAM;
  addrinfo *result = nullptr;
  const std::string port = std::to_string(url.port);
  if (getaddrinfo(url.host.c_str(), port.c_str(), &hints, &result) != 0) {
    return false;
  }
  std::memcpy(address, result->ai_addr, result->ai_addrlen);
  *length = static_cast<int>(result->ai_addrlen);
  freeaddrinfo(result);
  return true;
}

std::vector<std::string> strings(JNIEnv *env, jobjectArray values) {
  std::vector<std::string> result;
  const jsize count = env->GetArrayLength(values);
  result.reserve(count);
  for (jsize index = 0; index < count; ++index) {
    auto value =
        static_cast<jstring>(env->GetObjectArrayElement(values, index));
    const char *chars = env->GetStringUTFChars(value, nullptr);
    result.emplace_back(chars);
    env->ReleaseStringUTFChars(value, chars);
    env->DeleteLocalRef(value);
  }
  return result;
}

std::string string(JNIEnv *env, jstring value) {
  const char *chars = env->GetStringUTFChars(value, nullptr);
  std::string result(chars);
  env->ReleaseStringUTFChars(value, chars);
  return result;
}

std::string socket_state(SRT_SOCKSTATUS status) {
  switch (status) {
  case SRTS_CONNECTED:
    return "connected";
  case SRTS_BROKEN:
    return "broken";
  case SRTS_CONNECTING:
    return "connecting";
  case SRTS_CLOSED:
    return "closed";
  default:
    return "unavailable";
  }
}

void stop_locked() {
  state.running = false;
  if (state.udp >= 0) {
    shutdown(state.udp, SHUT_RDWR);
    close(state.udp);
    state.udp = -1;
  }
  if (state.reader.joinable())
    state.reader.join();
  if (state.group != SRT_INVALID_SOCK) {
    srt_close(state.group);
    state.group = SRT_INVALID_SOCK;
  }
  state.transports.clear();
  srt_cleanup();
}
} // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeProbe(JNIEnv *, jobject) {
  srt_startup();
  const SRTSOCKET group = srt_create_group(SRT_GTYPE_BROADCAST);
  if (group != SRT_INVALID_SOCK)
    srt_close(group);
  srt_cleanup();
  return group != SRT_INVALID_SOCK;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeStart(JNIEnv *env, jobject,
                                                     jobjectArray source_ips,
                                                     jobjectArray transports,
                                                     jstring url_value,
                                                     jstring mode_value) {
  std::lock_guard<std::mutex> lock(state.mutex);
  stop_locked();
  const std::vector<std::string> sources = strings(env, source_ips);
  state.transports = strings(env, transports);
  const std::string mode = string(env, mode_value);
  ParsedUrl url;
  sockaddr_storage remote{};
  int remote_length = 0;
  if (!parse_url(string(env, url_value), &url) ||
      !destination(url, &remote, &remote_length)) {
    return -1;
  }

  srt_startup();
  state.group = srt_create_group(mode == "backup" ? SRT_GTYPE_BACKUP
                                                  : SRT_GTYPE_BROADCAST);
  if (state.group == SRT_INVALID_SOCK) {
    stop_locked();
    return -1;
  }
  int live = SRTT_LIVE;
  int message_api = 1;
  int payload = kPayloadSize;
  srt_setsockflag(state.group, SRTO_TRANSTYPE, &live, sizeof(live));
  srt_setsockflag(state.group, SRTO_MESSAGEAPI, &message_api,
                  sizeof(message_api));
  srt_setsockflag(state.group, SRTO_PAYLOADSIZE, &payload, sizeof(payload));
  srt_setsockflag(state.group, SRTO_STREAMID, url.stream_id.data(),
                  url.stream_id.size());
  if (mode == "backup") {
    int stable = 500;
    int latency = std::max(1000, url.latency_ms);
    srt_setsockflag(state.group, SRTO_GROUPMINSTABLETIMEO, &stable,
                    sizeof(stable));
    srt_setsockflag(state.group, SRTO_PEERLATENCY, &latency, sizeof(latency));
  } else if (url.latency_ms > 0) {
    srt_setsockflag(state.group, SRTO_PEERLATENCY, &url.latency_ms,
                    sizeof(url.latency_ms));
  }

  std::vector<SRT_SOCKGROUPCONFIG> endpoints;
  for (size_t index = 0; index < sources.size(); ++index) {
    sockaddr_in source{};
    source.sin_family = AF_INET;
    if (inet_pton(AF_INET, sources[index].c_str(), &source.sin_addr) != 1) {
      continue;
    }
    auto endpoint = srt_prepare_endpoint(reinterpret_cast<sockaddr *>(&source),
                                         reinterpret_cast<sockaddr *>(&remote),
                                         remote_length);
    endpoint.token = static_cast<int>(index);
    endpoint.weight = state.transports[index] == "wifi"
                          ? static_cast<uint16_t>(2)
                          : static_cast<uint16_t>(1);
    endpoints.push_back(endpoint);
  }
  if (endpoints.empty() ||
      srt_connect_group(state.group, endpoints.data(),
                        static_cast<int>(endpoints.size())) == SRT_ERROR) {
    stop_locked();
    return -1;
  }

  state.udp = socket(AF_INET, SOCK_DGRAM, 0);
  if (state.udp < 0) {
    stop_locked();
    return -1;
  }
  setsockopt(state.udp, SOL_SOCKET, SO_RCVBUF, &kReceiveBuffer,
             sizeof(kReceiveBuffer));
  sockaddr_in loopback{};
  loopback.sin_family = AF_INET;
  loopback.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(state.udp, reinterpret_cast<sockaddr *>(&loopback),
           sizeof(loopback)) != 0) {
    stop_locked();
    return -1;
  }
  socklen_t length = sizeof(loopback);
  getsockname(state.udp, reinterpret_cast<sockaddr *>(&loopback), &length);
  const int port = ntohs(loopback.sin_port);
  state.running = true;
  state.reader = std::thread([] {
    char buffer[2048];
    while (state.running) {
      const ssize_t size = recv(state.udp, buffer, sizeof(buffer), 0);
      if (size <= 0)
        break;
      if (srt_sendmsg(state.group, buffer, static_cast<int>(size), -1, 0) ==
          SRT_ERROR) {
        break;
      }
    }
    state.running = false;
  });
  return port;
}

extern "C" JNIEXPORT void JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeStop(JNIEnv *, jobject) {
  std::lock_guard<std::mutex> lock(state.mutex);
  stop_locked();
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeStats(JNIEnv *env, jobject) {
  std::lock_guard<std::mutex> lock(state.mutex);
  if (!state.running || state.group == SRT_INVALID_SOCK)
    return nullptr;
  size_t count = 0;
  if (srt_group_data(state.group, nullptr, &count) == SRT_ERROR)
    return nullptr;
  std::vector<SRT_SOCKGROUPDATA> links(count);
  if (count > 0 &&
      srt_group_data(state.group, links.data(), &count) == SRT_ERROR) {
    return nullptr;
  }
  CBytePerfMon aggregate{};
  srt_bstats(state.group, &aggregate, 0);
  std::ostringstream json;
  json << "{\"bitrateKbps\":" << static_cast<int>(aggregate.mbpsSendRate * 1000)
       << ",\"rttMs\":" << static_cast<int>(aggregate.msRTT)
       << ",\"packetLossPct\":";
  const int64_t aggregate_packets = aggregate.pktSent + aggregate.pktSndLoss;
  json << (aggregate_packets > 0
               ? 100.0 * aggregate.pktSndLoss / aggregate_packets
               : 0.0)
       << ",\"links\":[";
  for (size_t index = 0; index < count; ++index) {
    if (index)
      json << ',';
    CBytePerfMon perf{};
    srt_bstats(links[index].id, &perf, 0);
    const int64_t packets = perf.pktSent + perf.pktSndLoss;
    const int token = links[index].token;
    const std::string transport =
        token >= 0 && static_cast<size_t>(token) < state.transports.size()
            ? state.transports[token]
            : "wifi";
    json << "{\"id\":\"" << links[index].id << "\",\"transport\":\""
         << transport << "\",\"state\":\""
         << socket_state(links[index].sockstate)
         << "\",\"rttMs\":" << static_cast<int>(perf.msRTT)
         << ",\"packetLossPct\":"
         << (packets > 0 ? 100.0 * perf.pktSndLoss / packets : 0.0)
         << ",\"bitrateKbps\":" << static_cast<int>(perf.mbpsSendRate * 1000)
         << '}';
  }
  json << "]}";
  return env->NewStringUTF(json.str().c_str());
}
