import Foundation

enum AgentDebugLog {
  static let notification = Notification.Name("VispAgentDebugLog67ea04")

  static func emit(
    location: String,
    message: String,
    hypothesisId: String,
    data: [String: Any] = [:]
  ) {
    NotificationCenter.default.post(
      name: notification,
      object: nil,
      userInfo: [
        "sessionId": "67ea04",
        "location": location,
        "message": message,
        "hypothesisId": hypothesisId,
        "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        "data": data,
      ]
    )
  }
}
