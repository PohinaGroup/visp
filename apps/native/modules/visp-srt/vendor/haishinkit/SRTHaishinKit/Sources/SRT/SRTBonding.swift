import Foundation
import Network
import libsrt

struct SRTBondingSource {
  let address: sockaddr_in
  let token: Int32
  let transport: String
}

public struct SRTBondedLinkPerformance: Sendable {
  public let id: Int32
  public let performance: SRTPerformanceData
  public let state: String
  public let token: Int32
}

enum SRTBonding {
  static func sources() -> [SRTBondingSource] {
    var interfaces: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&interfaces) == 0, let first = interfaces else {
      return []
    }
    defer { freeifaddrs(interfaces) }
    var result: [SRTBondingSource] = []
    var current: UnsafeMutablePointer<ifaddrs>? = first
    while let interface = current {
      defer { current = interface.pointee.ifa_next }
      guard
        let address = interface.pointee.ifa_addr,
        address.pointee.sa_family == UInt8(AF_INET)
      else {
        continue
      }
      let name = String(cString: interface.pointee.ifa_name)
      let metadata: (Int32, String)?
      switch name {
      case "en0":
        metadata = (0, "wifi")
      case "pdp_ip0":
        metadata = (1, "cellular")
      default:
        metadata = nil
      }
      guard let metadata else {
        continue
      }
      guard !result.contains(where: { $0.token == metadata.0 }) else {
        continue
      }
      let ipv4 = UnsafeRawPointer(address)
        .assumingMemoryBound(to: sockaddr_in.self)
        .pointee
      result.append(.init(address: ipv4, token: metadata.0, transport: metadata.1))
    }
    return result
  }

  static func cellularKeeper(host: String, port: UInt16) -> NWConnection {
    let parameters = NWParameters.udp
    parameters.requiredInterfaceType = .cellular
    let connection = NWConnection(
      host: NWEndpoint.Host(host),
      port: NWEndpoint.Port(rawValue: port)!,
      using: parameters
    )
    connection.start(queue: DispatchQueue(label: "com.visp.srt.cellular"))
    return connection
  }
}
