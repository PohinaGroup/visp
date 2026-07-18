import Foundation

struct WatchSnapshot: Codable, Equatable {
  static let supportedVersion = 1

  let version: Int
  let updatedAt: Double
  let stream: WatchStreamSnapshot
  let chat: WatchChatSnapshot

  static func decode(_ data: Data) throws -> WatchSnapshot {
    let snapshot = try JSONDecoder().decode(WatchSnapshot.self, from: data)
    guard snapshot.version == supportedVersion else {
      throw WatchSnapshotError.unsupportedVersion(snapshot.version)
    }
    return snapshot
  }
}

enum WatchSnapshotError: Error, Equatable {
  case unsupportedVersion(Int)
}

struct WatchStreamSnapshot: Codable, Equatable {
  let state: String
  let liveStartedAt: Double?
  let audioTier: Int
  let width: Int?
  let height: Int?
  let fps: Int?
  let message: String?
  let reconnectAttempt: Int?
}

struct WatchChatSnapshot: Codable, Equatable {
  let statuses: [String: String]
  let messages: [WatchChatMessage]
}

struct WatchChatMessage: Codable, Equatable, Identifiable {
  let id: String
  let provider: String
  let senderName: String
  let senderColor: String?
  let text: String
}
