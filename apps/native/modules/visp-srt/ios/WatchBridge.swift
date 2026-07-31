import Foundation
import WatchConnectivity

final class WatchBridge: NSObject, WCSessionDelegate {
  static let shared = WatchBridge()

  typealias SceneCommandHandler = (_ requestID: String, _ scene: String) -> Void
  typealias MessageReply = ([String: Any]) -> Void

  private let lock = NSLock()
  private var latestSnapshot: Data?
  private var sceneCommandHandler: SceneCommandHandler?
  private var pendingReplies: [String: MessageReply] = [:]
  private var frameInFlight = false

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

  // The viewfinder frames ride their own message key so the snapshot channel —
  // which goes through updateApplicationContext — never carries image bytes.
  var isWatchReachable: Bool {
    let session = WCSession.default
    return session.activationState == .activated && session.isReachable
  }

  var isFrameInFlight: Bool {
    lock.lock()
    defer { lock.unlock() }
    return frameInFlight
  }

  func sendFrame(_ jpeg: Data) {
    let session = WCSession.default
    guard session.activationState == .activated, session.isReachable else { return }
    lock.lock()
    frameInFlight = true
    lock.unlock()
    session.sendMessage(
      ["frame": jpeg],
      replyHandler: { [weak self] _ in self?.clearFrameInFlight() },
      errorHandler: { [weak self] _ in self?.clearFrameInFlight() }
    )
  }

  private func clearFrameInFlight() {
    lock.lock()
    frameInFlight = false
    lock.unlock()
  }

  func setSceneCommandHandler(_ handler: SceneCommandHandler?) {
    lock.lock()
    sceneCommandHandler = handler
    lock.unlock()
  }

  func replyToSceneCommand(requestID: String, error: String?) {
    lock.lock()
    let reply = pendingReplies.removeValue(forKey: requestID)
    lock.unlock()
    guard let reply else { return }
    reply(error.map { ["error": $0] } ?? ["ok": true])
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
    if message["request"] as? String == "snapshot", let data = snapshot() {
      replyHandler(["snapshot": data])
      return
    }
    guard
      message["command"] as? String == "setObsScene",
      let scene = message["scene"] as? String,
      !scene.isEmpty
    else {
      replyHandler(["error": "Unsupported Watch command"])
      return
    }
    lock.lock()
    let handler = sceneCommandHandler
    let requestID = UUID().uuidString
    if handler != nil {
      pendingReplies[requestID] = replyHandler
    }
    lock.unlock()
    guard let handler else {
      replyHandler(["error": "Open VISP on iPhone"])
      return
    }
    handler(requestID, scene)
    DispatchQueue.global().asyncAfter(deadline: .now() + 10) { [weak self] in
      self?.replyToSceneCommand(requestID: requestID, error: "Scene switch timed out")
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}

  func sessionDidDeactivate(_ session: WCSession) {
    session.activate()
  }
}
