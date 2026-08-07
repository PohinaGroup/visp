// Gate for the Watch viewfinder frame tap. Encoding a frame costs real work on
// the capture path, so decide whether to bother before touching the buffer.
enum PreviewFramePolicy {
  static let interval = Duration.seconds(1)

  static func shouldSendFrame(
    now: ContinuousClock.Instant,
    lastSent: ContinuousClock.Instant?,
    reachable: Bool,
    inFlight: Bool
  ) -> Bool {
    guard reachable, !inFlight else {
      return false
    }
    guard let lastSent else {
      return true
    }
    return lastSent.duration(to: now) >= interval
  }
}
