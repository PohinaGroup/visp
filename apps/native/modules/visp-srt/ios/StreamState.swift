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
}
