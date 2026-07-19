import Combine
import Foundation
import WatchConnectivity

final class WatchSessionModel: NSObject, ObservableObject, WCSessionDelegate {
  @Published private(set) var isReachable = false
  @Published private(set) var snapshot: WatchSnapshot?
  @Published private(set) var busyScene: String?
  @Published private(set) var requestedScene: String?
  @Published private(set) var sceneCommandError: String?

  private let session: WCSession?

  override init() {
    session = WCSession.isSupported() ? .default : nil
    super.init()
    session?.delegate = self
    session?.activate()
  }

  private func receive(_ data: Data) {
    guard let snapshot = try? WatchSnapshot.decode(data) else { return }
    DispatchQueue.main.async {
      self.snapshot = snapshot
      if snapshot.obs?.currentScene == self.requestedScene {
        self.requestedScene = nil
      }
    }
  }

  private func updateReachability(_ session: WCSession) {
    DispatchQueue.main.async {
      self.isReachable = session.isReachable
    }
    guard session.isReachable else { return }
    session.sendMessage(
      ["request": "snapshot"],
      replyHandler: { [weak self] reply in
        if let data = reply["snapshot"] as? Data {
          self?.receive(data)
        }
      },
      errorHandler: nil
    )
  }

  func setScene(_ scene: String) {
    guard
      let session,
      session.isReachable,
      busyScene == nil,
      requestedScene == nil
    else { return }
    busyScene = scene
    sceneCommandError = nil
    session.sendMessage(
      ["command": "setObsScene", "scene": scene],
      replyHandler: { [weak self] reply in
        DispatchQueue.main.async {
          self?.busyScene = nil
          if let error = reply["error"] as? String {
            self?.sceneCommandError = error
          } else {
            self?.requestedScene = scene
          }
        }
      },
      errorHandler: { [weak self] _ in
        DispatchQueue.main.async {
          self?.busyScene = nil
          self?.requestedScene = nil
          self?.sceneCommandError = "Open VISP on iPhone"
        }
      }
    )
  }

  func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    if let data = session.receivedApplicationContext["snapshot"] as? Data {
      receive(data)
    }
    updateReachability(session)
  }

  func sessionReachabilityDidChange(_ session: WCSession) {
    updateReachability(session)
  }

  func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
    receive(messageData)
  }

  func session(
    _ session: WCSession,
    didReceiveApplicationContext applicationContext: [String: Any]
  ) {
    if let data = applicationContext["snapshot"] as? Data {
      receive(data)
    }
  }
}
