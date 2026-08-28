import Testing
@testable import VispSrtPolicy

@Test func skipsFramesWhenTheWatchCannotTakeThem() {
  let now = ContinuousClock.now

  #expect(
    PreviewFramePolicy.shouldSendFrame(now: now, lastSent: nil, reachable: false, inFlight: false)
      == false
  )
  #expect(
    PreviewFramePolicy.shouldSendFrame(now: now, lastSent: nil, reachable: true, inFlight: true)
      == false
  )
}

@Test func sendsTheFirstFrameThenThrottlesToOnePerSecond() {
  let now = ContinuousClock.now

  #expect(
    PreviewFramePolicy.shouldSendFrame(now: now, lastSent: nil, reachable: true, inFlight: false)
  )
  #expect(
    PreviewFramePolicy.shouldSendFrame(
      now: now,
      lastSent: now - .milliseconds(900),
      reachable: true,
      inFlight: false
    ) == false
  )
  #expect(
    PreviewFramePolicy.shouldSendFrame(
      now: now,
      lastSent: now - .milliseconds(1_100),
      reachable: true,
      inFlight: false
    )
  )
}
