#include <jni.h>

#include <arpa/inet.h>
#include <netdb.h>
#include <poll.h>
#include <sys/socket.h>
#include <unistd.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <deque>
#include <mutex>
#include <iterator>
#include <random>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_set>
#include <vector>

namespace {
constexpr uint16_t kControlBit = 0x8000;
constexpr uint16_t kKeepalive = 0x1000;
constexpr uint16_t kAck = 0x1100;
constexpr uint16_t kReg1 = 0x1200;
constexpr uint16_t kReg2 = 0x1201;
constexpr uint16_t kReg3 = 0x1202;
constexpr uint16_t kRegNgp = 0x1211;
constexpr int kWindowDefault = 20'000;
constexpr int kWindowMinimum = 1'000;
constexpr int kWindowMaximum = 60'000;
constexpr auto kLinkTimeout = std::chrono::seconds(4);
constexpr auto kKeepaliveInterval = std::chrono::seconds(1);

using Clock = std::chrono::steady_clock;

struct Link {
  int fd = -1;
  std::string transport;
  bool registered = false;
  int window = kWindowDefault;
  int rtt_ms = 0;
  Clock::time_point last_received = Clock::now();
  std::unordered_set<uint32_t> in_flight;
  uint64_t bytes = 0;
  uint64_t packets = 0;
  uint64_t losses = 0;
};

struct State {
  std::mutex lifecycle_mutex;
  std::mutex data_mutex;
  std::atomic<bool> running{false};
  int local = -1;
  sockaddr_storage local_peer{};
  socklen_t local_peer_length = 0;
  bool has_local_peer = false;
  std::vector<Link> links;
  std::deque<std::pair<uint32_t, size_t>> packet_log;
  std::thread worker;
  std::array<uint8_t, 256> group{};
  bool creating_group = false;
  int group_creator = -1;
  bool has_group = false;
  Clock::time_point started = Clock::now();
  Clock::time_point stats_at = Clock::now();
};

State state;

uint16_t read_u16(const uint8_t *data) {
  uint16_t value;
  std::memcpy(&value, data, sizeof(value));
  return ntohs(value);
}

uint32_t read_u32(const uint8_t *data) {
  uint32_t value;
  std::memcpy(&value, data, sizeof(value));
  return ntohl(value);
}

uint64_t read_u64(const uint8_t *data) {
  return (static_cast<uint64_t>(read_u32(data)) << 32) | read_u32(data + 4);
}

void write_u16(uint8_t *data, uint16_t value) {
  value = htons(value);
  std::memcpy(data, &value, sizeof(value));
}

void write_u64(uint8_t *data, uint64_t value) {
  const uint32_t high = htonl(static_cast<uint32_t>(value >> 32));
  const uint32_t low = htonl(static_cast<uint32_t>(value));
  std::memcpy(data, &high, sizeof(high));
  std::memcpy(data + 4, &low, sizeof(low));
}

uint64_t elapsed_ms() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() -
                                                               state.started)
      .count();
}

bool is_data(const uint8_t *data, size_t size) {
  return size >= 4 && (data[0] & 0x80) == 0;
}

uint16_t control_type(const uint8_t *data, size_t size) {
  return size >= 2 ? read_u16(data) & 0x7fff : 0xffff;
}

constexpr bool sequence_acked(uint32_t sequence, uint32_t ack) {
  return sequence < ack ? ack - sequence < 100'000'000
                        : sequence - ack > 100'000'000;
}

static_assert(sequence_acked(41, 42));
static_assert(sequence_acked(0x7fff'fffe, 1));
static_assert(!sequence_acked(42, 41));

std::vector<std::string> strings(JNIEnv *env, jobjectArray values) {
  std::vector<std::string> result;
  if (values == nullptr)
    return result;
  const jsize count = env->GetArrayLength(values);
  result.reserve(count);
  for (jsize index = 0; index < count; ++index) {
    auto value = static_cast<jstring>(env->GetObjectArrayElement(values, index));
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

bool destination(const std::string &value, sockaddr_storage *address,
                 socklen_t *length) {
  constexpr char scheme[] = "srt://";
  if (value.rfind(scheme, 0) != 0)
    return false;
  const size_t query = value.find('?');
  const std::string authority =
      value.substr(sizeof(scheme) - 1, query - (sizeof(scheme) - 1));
  const size_t colon = authority.rfind(':');
  if (colon == std::string::npos)
    return false;
  int port;
  try {
    port = std::stoi(authority.substr(colon + 1));
  } catch (...) {
    return false;
  }
  if (port < 1 || port > 65535)
    return false;
  addrinfo hints{};
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_DGRAM;
  addrinfo *result = nullptr;
  if (getaddrinfo(authority.substr(0, colon).c_str(), std::to_string(port).c_str(),
                  &hints, &result) != 0)
    return false;
  std::memcpy(address, result->ai_addr, result->ai_addrlen);
  *length = static_cast<socklen_t>(result->ai_addrlen);
  freeaddrinfo(result);
  return true;
}

void send_control(Link &link, uint16_t type, const uint8_t *payload = nullptr,
                  size_t payload_size = 0) {
  std::vector<uint8_t> packet(2 + payload_size);
  write_u16(packet.data(), kControlBit | type);
  if (payload_size > 0)
    std::memcpy(packet.data() + 2, payload, payload_size);
  send(link.fd, packet.data(), packet.size(), MSG_NOSIGNAL);
}

void send_registration(Link &link) {
  send_control(link, kReg2, state.group.data(), state.group.size());
}

void acknowledge(uint32_t sequence) {
  for (auto &link : state.links) {
    if (link.in_flight.erase(sequence) == 0)
      continue;
    if (link.in_flight.size() * 1000 > static_cast<size_t>(link.window))
      link.window += 29;
    link.window = std::min(link.window + 1, kWindowMaximum);
  }
}

void acknowledge_before(uint32_t sequence) {
  for (auto &link : state.links) {
    for (auto iterator = link.in_flight.begin(); iterator != link.in_flight.end();) {
      iterator = sequence_acked(*iterator, sequence) ? link.in_flight.erase(iterator)
                                                    : std::next(iterator);
    }
  }
}

void mark_lost(uint32_t sequence) {
  for (auto &link : state.links) {
    if (link.in_flight.erase(sequence) == 0)
      continue;
    link.window = std::max(link.window - 100, kWindowMinimum);
    ++link.losses;
  }
}

void handle_nak(const uint8_t *data, size_t size) {
  size_t offset = 16;
  size_t processed = 0;
  while (offset + 4 <= size && processed < 4096) {
    uint32_t sequence = read_u32(data + offset);
    offset += 4;
    if ((sequence & 0x80000000) == 0) {
      mark_lost(sequence);
      ++processed;
      continue;
    }
    if (offset + 4 > size)
      return;
    const uint32_t end = read_u32(data + offset);
    offset += 4;
    sequence &= 0x7fffffff;
    while (sequence <= end && processed++ < 4096) {
      mark_lost(sequence++);
    }
  }
}

void forward_local(const uint8_t *data, size_t size) {
  if (!state.has_local_peer)
    return;
  sendto(state.local, data, size, MSG_NOSIGNAL,
         reinterpret_cast<const sockaddr *>(&state.local_peer),
         state.local_peer_length);
}

void handle_remote(size_t index, const uint8_t *data, size_t size) {
  if (size < 2)
    return;
  auto &link = state.links[index];
  link.last_received = Clock::now();
  const uint16_t type = control_type(data, size);
  switch (type) {
  case kRegNgp:
    if (!state.creating_group && !state.has_group) {
      state.creating_group = true;
      state.group_creator = static_cast<int>(index);
      send_control(link, kReg1, state.group.data(), state.group.size());
    }
    return;
  case kReg2:
    if (!state.has_group && size == state.group.size() + 2 &&
        std::memcmp(data + 2, state.group.data(), state.group.size() / 2) == 0) {
      std::memcpy(state.group.data(), data + 2, state.group.size());
      state.has_group = true;
      for (auto &candidate : state.links)
        send_registration(candidate);
    }
    return;
  case kReg3:
    link.registered = true;
    link.window = kWindowDefault;
    return;
  case kKeepalive:
    if (size >= 10)
      link.rtt_ms = static_cast<int>(std::min<uint64_t>(10'000, elapsed_ms() -
                                                                   read_u64(data + 2)));
    return;
  case kAck:
    if (size % 4 == 0) {
      for (size_t offset = 4; offset < size; offset += 4)
        acknowledge(read_u32(data + offset));
    }
    return;
  default:
    break;
  }
  if (!is_data(data, size)) {
    if (type == 2 && size >= 20)
      acknowledge_before(read_u32(data + 16));
    else if (type == 3)
      handle_nak(data, size);
  }
  forward_local(data, size);
}

int best_link() {
  int best = -1;
  int best_score = -1;
  for (size_t index = 0; index < state.links.size(); ++index) {
    auto &link = state.links[index];
    if (!link.registered)
      continue;
    const int score = link.window / static_cast<int>(link.in_flight.size() + 1);
    if (score > best_score) {
      best = static_cast<int>(index);
      best_score = score;
    }
  }
  return best;
}

void handle_local(const uint8_t *data, size_t size) {
  const int index = best_link();
  if (index < 0)
    return;
  auto &link = state.links[index];
  if (send(link.fd, data, size, MSG_NOSIGNAL) < 0)
    return;
  link.bytes += size;
  if (is_data(data, size)) {
    const uint32_t sequence = read_u32(data) & 0x7fffffff;
    state.packet_log.erase(
        std::remove_if(state.packet_log.begin(), state.packet_log.end(),
                       [sequence](const auto &entry) { return entry.first == sequence; }),
        state.packet_log.end());
    state.packet_log.emplace_back(sequence, static_cast<size_t>(index));
    link.in_flight.insert(sequence);
    if (state.packet_log.size() > 256) {
      const auto expired = state.packet_log.front();
      state.packet_log.pop_front();
      state.links[expired.second].in_flight.erase(expired.first);
    }
    ++link.packets;
  }
}

void maintain_links() {
  const auto now = Clock::now();
  if (!state.has_group) {
    if (state.creating_group && state.group_creator >= 0) {
      send_control(state.links[state.group_creator], kReg1, state.group.data(),
                   state.group.size());
    } else {
      for (auto &link : state.links)
        send_control(link, kReg2, state.group.data(), state.group.size());
    }
    return;
  }
  for (auto &link : state.links) {
    if (link.registered && now - link.last_received >= kLinkTimeout)
      link.registered = false;
    if (state.has_group && !link.registered)
      send_registration(link);
    if (link.registered) {
      uint8_t time[8];
      write_u64(time, elapsed_ms());
      send_control(link, kKeepalive, time, sizeof(time));
    }
  }
}

void run() {
  std::vector<pollfd> sockets(state.links.size() + 1);
  sockets[0] = {state.local, POLLIN, 0};
  for (size_t index = 0; index < state.links.size(); ++index)
    sockets[index + 1] = {state.links[index].fd, POLLIN, 0};
  auto next_keepalive = Clock::now() + kKeepaliveInterval;
  std::array<uint8_t, 2048> buffer{};
  while (state.running) {
    const int ready = poll(sockets.data(), sockets.size(), 200);
    if (!state.running)
      break;
    if (ready > 0 && (sockets[0].revents & POLLIN)) {
      sockaddr_storage peer{};
      socklen_t length = sizeof(peer);
      const ssize_t size = recvfrom(state.local, buffer.data(), buffer.size(), 0,
                                    reinterpret_cast<sockaddr *>(&peer), &length);
      if (size > 0) {
        std::lock_guard<std::mutex> lock(state.data_mutex);
        state.local_peer = peer;
        state.local_peer_length = length;
        state.has_local_peer = true;
        handle_local(buffer.data(), static_cast<size_t>(size));
      }
    }
    if (ready > 0) {
      for (size_t index = 0; index < state.links.size(); ++index) {
        if ((sockets[index + 1].revents & POLLIN) == 0)
          continue;
        const ssize_t size = recv(state.links[index].fd, buffer.data(), buffer.size(), 0);
        if (size > 0) {
          std::lock_guard<std::mutex> lock(state.data_mutex);
          handle_remote(index, buffer.data(), static_cast<size_t>(size));
        }
      }
    }
    if (Clock::now() >= next_keepalive) {
      std::lock_guard<std::mutex> lock(state.data_mutex);
      maintain_links();
      next_keepalive = Clock::now() + kKeepaliveInterval;
    }
  }
}

void stop_locked() {
  state.running = false;
  if (state.local >= 0) {
    close(state.local);
    state.local = -1;
  }
  for (auto &link : state.links) {
    if (link.fd >= 0) {
      close(link.fd);
      link.fd = -1;
    }
  }
  if (state.worker.joinable())
    state.worker.join();
  std::lock_guard<std::mutex> data_lock(state.data_mutex);
  state.links.clear();
  state.packet_log.clear();
  state.has_local_peer = false;
  state.creating_group = false;
  state.group_creator = -1;
  state.has_group = false;
}
} // namespace

extern "C" JNIEXPORT jintArray JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeSrtlaPrepare(JNIEnv *env,
                                                            jobject,
                                                            jint link_count) {
  std::lock_guard<std::mutex> lock(state.lifecycle_mutex);
  stop_locked();
  if (link_count < 1 || link_count > 8)
    return env->NewIntArray(0);
  std::vector<jint> descriptors;
  for (jint index = 0; index < link_count; ++index) {
    const int fd = socket(AF_INET, SOCK_DGRAM, 0);
    if (fd < 0) {
      stop_locked();
      return env->NewIntArray(0);
    }
    Link link;
    link.fd = fd;
    state.links.push_back(std::move(link));
    descriptors.push_back(fd);
  }
  jintArray result = env->NewIntArray(link_count);
  env->SetIntArrayRegion(result, 0, link_count, descriptors.data());
  return result;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeSrtlaStart(
    JNIEnv *env, jobject, jobjectArray source_ips, jobjectArray transports,
    jstring url_value) {
  std::lock_guard<std::mutex> lock(state.lifecycle_mutex);
  const auto sources = strings(env, source_ips);
  const auto names = strings(env, transports);
  sockaddr_storage remote{};
  socklen_t remote_length = 0;
  if (sources.size() != state.links.size() || names.size() != state.links.size() ||
      !destination(string(env, url_value), &remote, &remote_length)) {
    stop_locked();
    return -1;
  }
  for (size_t index = 0; index < state.links.size(); ++index) {
    sockaddr_in source{};
    source.sin_family = AF_INET;
    if (inet_pton(AF_INET, sources[index].c_str(), &source.sin_addr) != 1 ||
        bind(state.links[index].fd, reinterpret_cast<sockaddr *>(&source),
             sizeof(source)) != 0 ||
        connect(state.links[index].fd, reinterpret_cast<sockaddr *>(&remote),
                remote_length) != 0) {
      stop_locked();
      return -1;
    }
    state.links[index].transport = names[index];
  }
  state.local = socket(AF_INET, SOCK_DGRAM, 0);
  sockaddr_in loopback{};
  loopback.sin_family = AF_INET;
  loopback.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (state.local < 0 ||
      bind(state.local, reinterpret_cast<sockaddr *>(&loopback), sizeof(loopback)) != 0) {
    stop_locked();
    return -1;
  }
  socklen_t length = sizeof(loopback);
  if (getsockname(state.local, reinterpret_cast<sockaddr *>(&loopback), &length) != 0) {
    stop_locked();
    return -1;
  }
  std::random_device random;
  std::generate(state.group.begin(), state.group.end(), [&] {
    return static_cast<uint8_t>(random());
  });
  state.started = Clock::now();
  state.stats_at = state.started;
  for (auto &link : state.links) {
    link.last_received = state.started;
    send_control(link, kReg2, state.group.data(), state.group.size());
  }
  state.running = true;
  state.worker = std::thread(run);
  return ntohs(loopback.sin_port);
}

extern "C" JNIEXPORT void JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeSrtlaStop(JNIEnv *, jobject) {
  std::lock_guard<std::mutex> lock(state.lifecycle_mutex);
  stop_locked();
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_visp_mobile_srt_BondedSrtNative_nativeSrtlaStats(JNIEnv *env,
                                                          jobject) {
  if (!state.running)
    return nullptr;
  std::lock_guard<std::mutex> lock(state.data_mutex);
  const auto now = Clock::now();
  const double seconds = std::max(
      0.001, std::chrono::duration<double>(now - state.stats_at).count());
  state.stats_at = now;
  uint64_t total_bytes = 0;
  uint64_t total_packets = 0;
  uint64_t total_losses = 0;
  int max_rtt = 0;
  std::ostringstream links;
  for (size_t index = 0; index < state.links.size(); ++index) {
    auto &link = state.links[index];
    if (index)
      links << ',';
    const double loss = link.packets + link.losses > 0
                            ? 100.0 * link.losses / (link.packets + link.losses)
                            : 0.0;
    links << "{\"id\":\"srtla-" << index << "\",\"transport\":\""
          << link.transport << "\",\"state\":\""
          << (link.registered ? "connected" : "connecting") << "\",\"rttMs\":"
          << link.rtt_ms << ",\"packetLossPct\":" << loss
          << ",\"bitrateKbps\":" << static_cast<int>(link.bytes * 8 / seconds / 1000)
          << '}';
    total_bytes += link.bytes;
    total_packets += link.packets;
    total_losses += link.losses;
    max_rtt = std::max(max_rtt, link.rtt_ms);
    link.bytes = 0;
    link.packets = 0;
    link.losses = 0;
  }
  const double loss = total_packets + total_losses > 0
                          ? 100.0 * total_losses / (total_packets + total_losses)
                          : 0.0;
  std::ostringstream json;
  json << "{\"bitrateKbps\":" << static_cast<int>(total_bytes * 8 / seconds / 1000)
       << ",\"rttMs\":" << max_rtt << ",\"packetLossPct\":" << loss
       << ",\"links\":[" << links.str() << "]}";
  return env->NewStringUTF(json.str().c_str());
}
