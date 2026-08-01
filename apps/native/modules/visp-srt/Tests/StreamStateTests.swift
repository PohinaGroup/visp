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

@Test func pictureInPictureKeepsActiveSessionsRunningInBackground() {
  for state in [StreamState.connecting, .live, .reconnecting] {
    #expect(state.backgroundAction(pictureInPictureActiveOrStarting: true) == .keepStreaming)
    #expect(state.backgroundAction(pictureInPictureActiveOrStarting: false) == .stopStreaming)
  }
}

@Test func inactiveSessionsStillSuspendInBackground() {
  for state in [StreamState.idle, .preparing, .stopping, .error] {
    #expect(state.backgroundAction(pictureInPictureActiveOrStarting: true) == .suspend)
    #expect(state.backgroundAction(pictureInPictureActiveOrStarting: false) == .suspend)
  }
}
