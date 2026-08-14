// Adapted from Moblin's MIT-licensed SRTLA client at commit
// b67dd0d92ee8fec1333572703486c9d2a3e7677f. See MOBLIN-LICENSE.

import Foundation
import Network

private let srtlaQueue = DispatchQueue(label: "com.visp.srtla-client")

final class SRTLAClient: @unchecked Sendable {
  enum Error: Swift.Error { case connectionFailed }

  private final class Link: @unchecked Sendable {
    let token: Int32
    let type: NWInterface.InterfaceType
    var connection: NWConnection?
    var ready = false
    var registered = false
    var inFlight: Set<UInt32> = []
    var window = 20_000
    var lastReceivedMs = monotonicMilliseconds()
    var rttMs = 0
    var bytes: UInt64 = 0
    var packets: UInt64 = 0
    var losses: UInt64 = 0

    init(token: Int32, type: NWInterface.InterfaceType) {
      self.token = token
      self.type = type
    }
  }

  private var links = [Link(token: 0, type: .wifi), Link(token: 1, type: .cellular)]
  private var packetLog: [(sequence: UInt32, token: Int32)] = []
  private var listener: NWListener?
  private var localConnection: NWConnection?
  private var continuation: CheckedContinuation<UInt16, any Swift.Error>?
  private var timeout: (any DispatchSourceTimer)?
  private var keepalive: (any DispatchSourceTimer)?
  private var group = Data((0..<256).map { _ in UInt8.random(in: .min ... .max) })
  private var creatingGroup = false
  private var groupCreatorToken: Int32?
  private var hasGroup = false
  private var startedMs = monotonicMilliseconds()
  private var statsAtMs = monotonicMilliseconds()
  private var running = false
  private var host: NWEndpoint.Host?
  private var port: NWEndpoint.Port?

  func start(host: String, port: UInt16) async throws -> UInt16 {
    try await withCheckedThrowingContinuation { continuation in
      srtlaQueue.async {
        self.stopInternal()
        self.continuation = continuation
        self.host = NWEndpoint.Host(host)
        self.port = NWEndpoint.Port(rawValue: port)
        self.startedMs = monotonicMilliseconds()
        self.statsAtMs = self.startedMs
        self.running = true
        self.links = [Link(token: 0, type: .wifi), Link(token: 1, type: .cellular)]
        for link in self.links { self.start(link) }
        let timeout = DispatchSource.makeTimerSource(queue: srtlaQueue)
        timeout.schedule(deadline: .now() + 8)
        timeout.setEventHandler { [weak self] in self?.fail() }
        timeout.activate()
        self.timeout = timeout
        let keepalive = DispatchSource.makeTimerSource(queue: srtlaQueue)
        keepalive.schedule(deadline: .now() + 1, repeating: 1)
        keepalive.setEventHandler { [weak self] in self?.maintainLinks() }
        keepalive.activate()
        self.keepalive = keepalive
      }
    }
  }

  func stop() {
    srtlaQueue.sync { stopInternal() }
  }

  func statistics() -> [SRTBondedLinkPerformance] {
    srtlaQueue.sync {
      let now = monotonicMilliseconds()
      let seconds = max(0.001, Double(now - statsAtMs) / 1_000)
      statsAtMs = now
      return links.map { link in
        defer {
          link.bytes = 0
          link.packets = 0
          link.losses = 0
        }
        let total = link.packets + link.losses
        return SRTBondedLinkPerformance(
          bitrateKbps: Int(Double(link.bytes * 8) / seconds / 1_000),
          id: link.token,
          packetLossPct: total > 0 ? 100 * Double(link.losses) / Double(total) : 0,
          rttMs: link.rttMs,
          state: link.registered ? "connected" : "connecting",
          token: link.token
        )
      }
    }
  }

  private func start(_ link: Link) {
    guard running, let host, let port else { return }
    link.connection?.forceCancel()
    link.ready = false
    link.registered = false
    let parameters = NWParameters(dtls: .none)
    parameters.prohibitExpensivePaths = false
    parameters.requiredInterfaceType = link.type
    let connection = NWConnection(host: host, port: port, using: parameters)
    link.connection = connection
    connection.stateUpdateHandler = { [weak self, weak link] state in
      guard let self, let link else { return }
      srtlaQueue.async {
        guard self.running, link.connection === connection else { return }
        switch state {
        case .ready:
          link.ready = true
          link.lastReceivedMs = monotonicMilliseconds()
          if self.hasGroup { self.sendRegistration(link) }
          else { self.send(type: 0x1201, payload: self.group, on: link) }
          self.receive(on: link)
        case .failed, .cancelled:
          link.ready = false
          link.registered = false
          if self.groupCreatorToken == link.token { self.groupCreatorToken = nil }
          if self.running {
            srtlaQueue.asyncAfter(deadline: .now() + 1) { [weak self, weak link] in
              if let self, let link { self.start(link) }
            }
          }
        default: break
        }
      }
    }
    connection.start(queue: srtlaQueue)
  }

  private func receive(on link: Link) {
    link.connection?.receiveMessage { [weak self, weak link] data, _, _, error in
      guard let self, let link, self.running, link.connection != nil else { return }
      if let data, !data.isEmpty { self.handle(data, from: link) }
      if error == nil { self.receive(on: link) }
    }
  }

  private func handle(_ data: Data, from link: Link) {
    guard data.count >= 2 else { return }
    link.lastReceivedMs = monotonicMilliseconds()
    let type = data.uint16(at: 0) & 0x7fff
    switch type {
    case 0x1211 where !creatingGroup && !hasGroup:
      creatingGroup = true
      groupCreatorToken = link.token
      send(type: 0x1200, payload: group, on: link)
      return
    case 0x1201 where !hasGroup && data.count == 258 && data[2..<130] == group[0..<128]:
      group = data.subdata(in: 2..<258)
      hasGroup = true
      for candidate in links where candidate.ready {
        sendRegistration(candidate)
      }
      return
    case 0x1202:
      link.registered = true
      link.window = 20_000
      if listener == nil { startListener() }
      return
    case 0x1000 where data.count >= 10:
      let sent = data.uint64(at: 2)
      let now = elapsedMilliseconds()
      link.rttMs = Int(min(10_000, now >= sent ? now - sent : 0))
      return
    case 0x1100 where data.count.isMultiple(of: 4):
      for offset in stride(from: 4, to: data.count, by: 4) {
        acknowledge(data.uint32(at: offset))
      }
      return
    default: break
    }
    if !data.isSRTData {
      if type == 2, data.count >= 20 { acknowledge(before: data.uint32(at: 16)) }
      else if type == 3 { handleNak(data) }
    }
    localConnection?.send(content: data, completion: .idempotent)
  }

  private func startListener() {
    do {
      let parameters = NWParameters(dtls: .none, udp: NWProtocolUDP.Options())
      parameters.acceptLocalOnly = true
      let listener = try NWListener(using: parameters)
      listener.stateUpdateHandler = { [weak self] state in
        guard let self else { return }
        switch state {
        case .ready:
          guard let port = listener.port?.rawValue else { self.fail(); return }
          self.timeout?.cancel()
          self.timeout = nil
          self.continuation?.resume(returning: port)
          self.continuation = nil
        case .failed: self.fail()
        default: break
        }
      }
      listener.newConnectionHandler = { [weak self] connection in
        guard let self else { return }
        self.localConnection?.forceCancel()
        self.localConnection = connection
        connection.start(queue: srtlaQueue)
        self.receiveLocal(connection)
      }
      self.listener = listener
      listener.start(queue: srtlaQueue)
    } catch {
      fail()
    }
  }

  private func receiveLocal(_ connection: NWConnection) {
    connection.receiveMessage { [weak self] data, _, _, error in
      guard let self, self.running, self.localConnection === connection else { return }
      if let data, !data.isEmpty { self.sendLocal(data) }
      if error == nil { self.receiveLocal(connection) }
    }
  }

  private func sendLocal(_ data: Data) {
    guard let link = links.filter(\.registered).max(by: { score($0) < score($1) }) else { return }
    link.connection?.send(content: data, completion: .idempotent)
    link.bytes += UInt64(data.count)
    if data.isSRTData {
      let sequence = data.uint32(at: 0) & 0x7fff_ffff
      packetLog.removeAll { $0.sequence == sequence }
      packetLog.append((sequence, link.token))
      link.inFlight.insert(sequence)
      if packetLog.count > 256 {
        let expired = packetLog.removeFirst()
        links.first(where: { $0.token == expired.token })?.inFlight.remove(expired.sequence)
      }
      link.packets += 1
    }
  }

  private func score(_ link: Link) -> Int { link.window / (link.inFlight.count + 1) }

  private func sendRegistration(_ link: Link) {
    send(type: 0x1201, payload: group, on: link)
  }

  private func send(type: UInt16, payload: Data = Data(), on link: Link) {
    var packet = Data(count: 2)
    packet.setUInt16(type | 0x8000, at: 0)
    packet.append(payload)
    link.connection?.send(content: packet, completion: .idempotent)
  }

  private func maintainLinks() {
    let now = monotonicMilliseconds()
    if !hasGroup {
      if let creator = links.first(where: { $0.token == groupCreatorToken && $0.ready }) {
        send(type: 0x1200, payload: group, on: creator)
      } else {
        creatingGroup = false
        groupCreatorToken = nil
        for link in links where link.ready { send(type: 0x1201, payload: group, on: link) }
      }
      return
    }
    for link in links {
      if link.registered && now - link.lastReceivedMs >= 4_000 {
        link.registered = false
        start(link)
        continue
      }
      guard link.registered else {
        if link.ready { sendRegistration(link) }
        continue
      }
      var timestamp = Data(count: 8)
      timestamp.setUInt64(elapsedMilliseconds(), at: 0)
      send(type: 0x1000, payload: timestamp, on: link)
    }
  }

  private func acknowledge(_ sequence: UInt32) {
    for link in links where link.inFlight.remove(sequence) != nil {
      if link.inFlight.count * 1_000 > link.window { link.window += 29 }
      link.window = min(60_000, link.window + 1)
    }
  }

  private func acknowledge(before sequence: UInt32) {
    for link in links {
      link.inFlight = link.inFlight.filter { candidate in
        candidate < sequence ? sequence - candidate >= 100_000_000
          : candidate - sequence <= 100_000_000
      }
    }
  }

  private func markLost(_ sequence: UInt32) {
    for link in links where link.inFlight.remove(sequence) != nil {
      link.window = max(1_000, link.window - 100)
      link.losses += 1
    }
  }

  private func handleNak(_ data: Data) {
    var offset = 16
    var processed = 0
    while offset + 4 <= data.count, processed < 4_096 {
      var sequence = data.uint32(at: offset)
      offset += 4
      if sequence & 0x8000_0000 == 0 {
        markLost(sequence)
        processed += 1
      } else {
        guard offset + 4 <= data.count else { return }
        let end = data.uint32(at: offset)
        offset += 4
        sequence &= 0x7fff_ffff
        while sequence <= end, processed < 4_096 {
          markLost(sequence)
          sequence += 1
          processed += 1
        }
      }
    }
  }

  private func elapsedMilliseconds() -> UInt64 {
    monotonicMilliseconds() - startedMs
  }

  private func fail() {
    continuation?.resume(throwing: Error.connectionFailed)
    continuation = nil
    stopInternal()
  }

  private func stopInternal() {
    running = false
    timeout?.cancel()
    timeout = nil
    keepalive?.cancel()
    keepalive = nil
    listener?.cancel()
    listener = nil
    localConnection?.forceCancel()
    localConnection = nil
    for link in links { link.connection?.forceCancel() }
    continuation?.resume(throwing: Error.connectionFailed)
    continuation = nil
    creatingGroup = false
    groupCreatorToken = nil
    hasGroup = false
    packetLog.removeAll()
  }
}

private func monotonicMilliseconds() -> UInt64 {
  DispatchTime.now().uptimeNanoseconds / 1_000_000
}

private extension Data {
  var isSRTData: Bool { count >= 4 && self[0] & 0x80 == 0 }

  func uint16(at offset: Int) -> UInt16 {
    UInt16(self[offset]) << 8 | UInt16(self[offset + 1])
  }

  func uint32(at offset: Int) -> UInt32 {
    UInt32(self[offset]) << 24 | UInt32(self[offset + 1]) << 16
      | UInt32(self[offset + 2]) << 8 | UInt32(self[offset + 3])
  }

  func uint64(at offset: Int) -> UInt64 {
    UInt64(uint32(at: offset)) << 32 | UInt64(uint32(at: offset + 4))
  }

  mutating func setUInt16(_ value: UInt16, at offset: Int) {
    self[offset] = UInt8(truncatingIfNeeded: value >> 8)
    self[offset + 1] = UInt8(truncatingIfNeeded: value)
  }

  mutating func setUInt64(_ value: UInt64, at offset: Int) {
    for index in 0..<8 {
      self[offset + index] = UInt8(truncatingIfNeeded: value >> UInt64((7 - index) * 8))
    }
  }
}
