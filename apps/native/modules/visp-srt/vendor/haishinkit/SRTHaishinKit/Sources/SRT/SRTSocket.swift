import Foundation
import HaishinKit
import Logboard
import Network
import libsrt

final actor SRTSocket {
  static let payloadSize: Int = 1316

  enum Error: Swift.Error {
    case notConnected
    case rejected(_ reason: SRTRejectReason)
    case illegalState(_ message: String)
  }

  enum Status: Int, CustomDebugStringConvertible {
    case unknown
    case `init`
    case opened
    case listening
    case connecting
    case connected
    case broken
    case closing
    case closed
    case nonexist

    var debugDescription: String {
      switch self {
      case .unknown:
        return "unknown"
      case .`init`:
        return "init"
      case .opened:
        return "opened"
      case .listening:
        return "listening"
      case .connecting:
        return "connecting"
      case .connected:
        return "connected"
      case .broken:
        return "broken"
      case .closing:
        return "closing"
      case .closed:
        return "closed"
      case .nonexist:
        return "nonexist"
      }
    }

    init?(_ status: SRT_SOCKSTATUS) {
      self.init(rawValue: Int(status.rawValue))
      defer {
        logger.trace(debugDescription)
      }
    }
  }

  var inputs: AsyncStream<Data> {
    AsyncStream<Data> { continuation in
      // If Task.detached is not used, closing will result in a deadlock.
      Task.detached {
        while await self.connected {
          let result = await self.recvmsg()
          if 0 <= result {
            continuation.yield(await self.incomingBuffer.subdata(in: 0..<Data.Index(result)))
          } else {
            await self.stopRunning()
            continuation.finish()
          }
        }
      }
    }
  }

  var performanceData: SRTPerformanceData {
    .init(mon: perf)
  }

  var status: Status {
    .init(srt_getsockstate(socket)) ?? .unknown
  }

  private(set) var isRunning = false
  private var perf: CBytePerfMon = .init()
  private var socket: SRTSOCKET = SRT_INVALID_SOCK
  private let bondingMode: String
  private var cellularKeeper: NWConnection?
  private var outputs: AsyncStream<Data>.Continuation? {
    didSet {
      oldValue?.finish()
    }
  }
  private var connected: Bool {
    status == .connected
  }
  private var windowSizeC: Int32 = 1024 * 4
  private lazy var incomingBuffer: Data = .init(count: Int(windowSizeC))

  init(bondingMode: String = "off") {
    self.bondingMode = bondingMode
    if bondingMode == "broadcast" {
      socket = srt_create_group(SRT_GTYPE_BROADCAST)
    } else if bondingMode == "backup" {
      socket = srt_create_group(SRT_GTYPE_BACKUP)
    } else {
      socket = srt_create_socket()
    }
  }

  init(socket: SRTSOCKET, options: [SRTSocketOption]) async throws {
    self.socket = socket
    self.bondingMode = "off"
    guard configure(options, restriction: .post) else {
      throw makeSocketError()
    }
    if incomingBuffer.count < windowSizeC {
      incomingBuffer = .init(count: Int(windowSizeC))
    }
  }

  func getSocketOption(_ name: SRTSocketOption.Name) throws -> SRTSocketOption {
    return try SRTSocketOption(name: name, socket: socket)
  }

  func setSocketOption(_ option: SRTSocketOption) throws {
    try option.setSockflag(socket)
  }

  func open(_ url: SRTSocketURL) async throws {
    if socket == SRT_INVALID_SOCK {
      throw makeSocketError()
    }
    guard configure(url.options, restriction: .pre) else {
      throw makeSocketError()
    }
    let status: Int32 = try await {
      switch url.mode {
      case .caller:
        guard var remote = url.remote else {
          return SRT_ERROR
        }
        var remoteaddr = remote.makeSockaddr()
        if bondingMode != "off" {
          if let host = url.url.host {
            cellularKeeper = SRTBonding.cellularKeeper(
              host: host,
              port: UInt16(url.url.port ?? SRTSocketURL.defaultPort)
            )
          }
          if bondingMode == "backup" {
            var stableTimeout: Int32 = 500
            var peerLatency: Int32 = 1_000
            guard
              srt_setsockflag(
                socket,
                SRTO_GROUPMINSTABLETIMEO,
                &stableTimeout,
                Int32(MemoryLayout.size(ofValue: stableTimeout))
              ) != SRT_ERROR,
              srt_setsockflag(
                socket,
                SRTO_PEERLATENCY,
                &peerLatency,
                Int32(MemoryLayout.size(ofValue: peerLatency))
              ) != SRT_ERROR
            else {
              return SRT_ERROR
            }
          }
          var sources = SRTBonding.sources()
          for _ in 0..<8 where !sources.contains(where: { $0.token == 1 }) {
            try? await Task.sleep(nanoseconds: 250_000_000)
            sources = SRTBonding.sources()
          }
          if sources.isEmpty {
            sources = [
              .init(address: sockaddr_in("0.0.0.0", port: 0)!, token: 0, transport: "wifi")
            ]
          }
          var endpoints = sources.map { source -> SRT_SOCKGROUPCONFIG in
            var local = source.address
            var localaddr = local.makeSockaddr()
            var endpoint = srt_prepare_endpoint(
              &localaddr,
              &remoteaddr,
              Int32(remote.size)
            )
            endpoint.token = source.token
            endpoint.weight = source.token == 0 ? 2 : 1
            return endpoint
          }
          return srt_connect_group(socket, &endpoints, Int32(endpoints.count))
        }
        return srt_connect(socket, &remoteaddr, Int32(remote.size))
      case .listener:
        guard var local = url.local else {
          return SRT_ERROR
        }
        var localaddr = local.makeSockaddr()
        let status = srt_bind(socket, &localaddr, Int32(local.size))
        guard status != SRT_ERROR else {
          throw makeSocketError()
        }
        return srt_listen(socket, 1)
      case .rendezvous:
        guard var remote = url.remote, var local = url.local else {
          return SRT_ERROR
        }
        var remoteaddr = remote.makeSockaddr()
        var localaddr = local.makeSockaddr()
        return srt_rendezvous(
          socket, &remoteaddr, Int32(remote.size), &localaddr, Int32(local.size))
      }
    }()
    guard status != SRT_ERROR else {
      let reason = SRTRejectReason(socket: socket) ?? .unknown
      throw Error.rejected(reason)
    }
    switch url.mode {
    case .listener:
      break
    default:
      guard configure(url.options, restriction: .post) else {
        throw makeSocketError()
      }
      if incomingBuffer.count < windowSizeC {
        incomingBuffer = .init(count: Int(windowSizeC))
      }
    }
    await startRunning()
  }

  func accept(_ options: [SRTSocketOption]) async throws -> SRTSocket {
    try await withCheckedThrowingContinuation {
      (continuation: CheckedContinuation<SRTSocket, Swift.Error>) in
      Task.detached { [self] in
        do {
          let accept = srt_accept(await socket, nil, nil)
          guard -1 < accept else {
            throw await makeSocketError()
          }
          let socket = try await SRTSocket(socket: accept, options: options)
          await socket.startRunning()
          continuation.resume(returning: socket)
        } catch {
          continuation.resume(throwing: error)
        }
      }
    }
  }

  func send(_ data: Data) throws {
    guard connected else {
      throw Error.notConnected
    }
    for data in data.chunk(Self.payloadSize) {
      outputs?.yield(data)
    }
  }

  private func configure(_ options: [SRTSocketOption], restriction: SRTSocketOption.Restriction)
    -> Bool
  {
    var failures: [String] = []
    for option in options where option.name.restriction == restriction {
      do {
        try option.setSockflag(socket)
      } catch {
        failures.append(option.name.rawValue)
      }
    }
    guard failures.isEmpty else {
      logger.error(failures)
      return false
    }
    return true
  }

  private func bstats() -> Int32 {
    guard socket != SRT_INVALID_SOCK else {
      return SRT_ERROR
    }
    return srt_bstats(socket, &perf, 1)
  }

  func bondedLinkPerformance() -> [SRTBondedLinkPerformance] {
    guard bondingMode != "off" else {
      return []
    }
    var count = 0
    guard srt_group_data(socket, nil, &count) != SRT_ERROR, count > 0 else {
      return []
    }
    var links = Array(repeating: SRT_SOCKGROUPDATA(), count: count)
    guard srt_group_data(socket, &links, &count) != SRT_ERROR else {
      return []
    }
    return links.prefix(count).compactMap { link in
      var memberPerf = CBytePerfMon()
      guard srt_bstats(link.id, &memberPerf, 1) != SRT_ERROR else {
        return nil
      }
      return .init(
        id: link.id,
        performance: .init(mon: memberPerf),
        state: Status(link.sockstate)?.debugDescription ?? "unknown",
        token: link.token
      )
    }
  }

  private func makeSocketError() -> Error {
    let error_message = String(cString: srt_getlasterror_str())
    defer {
      logger.error(error_message)
    }
    if socket != SRT_INVALID_SOCK {
      srt_close(socket)
      socket = SRT_INVALID_SOCK
    }
    return .illegalState(error_message)
  }

  @inline(__always)
  private func sendmsg(_ data: Data) -> Int32 {
    return data.withUnsafeBytes { pointer in
      guard let buffer = pointer.baseAddress?.assumingMemoryBound(to: CChar.self) else {
        return SRT_ERROR
      }
      return srt_sendmsg(socket, buffer, Int32(data.count), -1, 0)
    }
  }

  @inline(__always)
  private func recvmsg() -> Int32 {
    return incomingBuffer.withUnsafeMutableBytes { pointer in
      guard let buffer = pointer.baseAddress?.assumingMemoryBound(to: CChar.self) else {
        return SRT_ERROR
      }
      return srt_recvmsg(socket, buffer, windowSizeC)
    }
  }
}

extension SRTSocket: AsyncRunner {
  // MARK: AsyncRunner
  func startRunning() async {
    guard !isRunning else {
      return
    }
    let stream = AsyncStream<Data> { continuation in
      self.outputs = continuation
    }
    Task {
      for await data in stream {
        let result = sendmsg(data)
        if result == -1 {
          await stopRunning()
        }
      }
    }
    isRunning = true
  }

  func stopRunning() async {
    guard isRunning else {
      return
    }
    srt_close(socket)
    socket = SRT_INVALID_SOCK
    cellularKeeper?.cancel()
    cellularKeeper = nil
    outputs = nil
    isRunning = false
  }
}

extension SRTSocket: NetworkTransportReporter {
  // MARK: NetworkTransportReporter
  func makeNetworkTransportReport() -> NetworkTransportReport {
    _ = bstats()
    let performanceData = self.performanceData
    return .init(
      queueBytesOut: Int(performanceData.byteSndBuf),
      totalBytesIn: Int(performanceData.byteRecvTotal),
      totalBytesOut: Int(performanceData.byteSentTotal)
    )
  }

  func makeNetworkMonitor() -> NetworkMonitor {
    return .init(self)
  }
}
