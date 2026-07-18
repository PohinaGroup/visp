import Foundation
import Testing
@testable import VispSrtPolicy

@Test func decodesSupportedWatchSnapshot() throws {
  let data = Data(##"{"version":1,"updatedAt":200,"stream":{"state":"live","liveStartedAt":100,"audioTier":2,"width":1280,"height":720,"fps":30},"chat":{"statuses":{"twitch":"connected"},"messages":[{"id":"m1","provider":"twitch","senderName":"Viewer","senderColor":"#AABBCC","text":"Hello"}]}}"##.utf8)

  let snapshot = try WatchSnapshot.decode(data)

  #expect(snapshot.stream.state == "live")
  #expect(snapshot.stream.audioTier == 2)
  #expect(snapshot.chat.messages.first?.text == "Hello")
}

@Test func rejectsUnsupportedAndMalformedWatchSnapshots() {
  let unsupported = Data(#"{"version":2,"updatedAt":0,"stream":{"state":"idle","audioTier":0},"chat":{"statuses":{},"messages":[]}}"#.utf8)
  let malformed = Data("not-json".utf8)

  #expect(throws: WatchSnapshotError.unsupportedVersion(2)) {
    try WatchSnapshot.decode(unsupported)
  }
  #expect(throws: (any Error).self) {
    try WatchSnapshot.decode(malformed)
  }
}
