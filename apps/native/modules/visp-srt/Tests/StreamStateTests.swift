import Testing
@testable import VispSrtPolicy

@Test func activeStreamStatesSurviveViewDetachment() {
  for state in [StreamState.connecting, .live, .reconnecting, .stopping] {
    #expect(state.shouldSuspendWhenDetached == false)
  }
}

@Test func inactiveStreamStatesStillSuspendWhenDetached() {
  for state in [StreamState.idle, .preparing, .error] {
    #expect(state.shouldSuspendWhenDetached)
  }
}
