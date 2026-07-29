import Foundation

enum AgentDebugLog {
  static let notification = Notification.Name("VispAgentDebugLogDed1be")

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
        "sessionId": "ded1be",
        "location": location,
        "message": message,
        "hypothesisId": hypothesisId,
        "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        "data": data,
      ]
    )
  }
}
