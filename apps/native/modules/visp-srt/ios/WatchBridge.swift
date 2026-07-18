import Foundation
import WatchConnectivity

final class WatchBridge: NSObject, WCSessionDelegate {
  static let shared = WatchBridge()

  private let lock = NSLock()
  private var latestSnapshot: Data?

  private override init() {
    super.init()
    guard WCSession.isSupported() else { return }
    WCSession.default.delegate = self
    WCSession.default.activate()
  }

  func sync(_ json: String) {
    guard let data = json.data(using: .utf8) else { return }
    lock.lock()
    latestSnapshot = data
    lock.unlock()
    push(data, through: WCSession.default)
  }

  private func snapshot() -> Data? {
    lock.lock()
    defer { lock.unlock() }
    return latestSnapshot
  }

  private func push(_ data: Data, through session: WCSession) {
    guard session.activationState == .activated else { return }
    try? session.updateApplicationContext(["snapshot": data])
    if session.isReachable {
      session.sendMessageData(data, replyHandler: nil, errorHandler: nil)
    }
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    guard activationState == .activated, let data = snapshot() else { return }
    push(data, through: session)
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    guard session.isReachable, let data = snapshot() else { return }
    push(data, through: session)
  }

  func session(
    _ session: WCSession,
    didReceiveMessage message: [String: Any],
    replyHandler: @escaping ([String: Any]) -> Void
  ) {
    guard message["request"] as? String == "snapshot", let data = snapshot() else {
      replyHandler([:])
      return
    }
    replyHandler(["snapshot": data])
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}
