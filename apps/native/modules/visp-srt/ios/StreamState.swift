enum StreamState: String {
  case idle
  case preparing
  case connecting
  case live
  case reconnecting
  case stopping
  case error

  var shouldSuspendWhenDetached: Bool {
    switch self {
    case .idle, .preparing, .error:
      true
    case .connecting, .live, .reconnecting, .stopping:
      false
    }
  }

  func backgroundAction(pictureInPictureActiveOrStarting: Bool) -> BackgroundAction {
    switch self {
    case .connecting, .live, .reconnecting:
      pictureInPictureActiveOrStarting ? .keepStreaming : .stopStreaming
    case .idle, .preparing, .stopping, .error:
      .suspend
    }
  }
}

enum BackgroundAction {
  case keepStreaming
  case stopStreaming
  case suspend
}
