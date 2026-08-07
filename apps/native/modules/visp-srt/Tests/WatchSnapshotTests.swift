import Foundation
import Testing
@testable import VispSrtPolicy

@Test func decodesSupportedWatchSnapshot() throws {
  let data = Data(##"{"version":1,"updatedAt":200,"stream":{"state":"live","liveStartedAt":100,"audioTier":2,"width":1280,"height":720,"fps":30},"chat":{"statuses":{"twitch":"connected","youtube":"connected"},"messages":[{"id":"m1","provider":"youtube","senderName":"Viewer","senderColor":"#AABBCC","badges":["Moderator"],"text":"Hello"}]},"viewers":[{"provider":"twitch","count":12},{"provider":"youtube","count":null}],"obs":{"configured":true,"connected":true,"pending":false,"scenes":["Main","Be right back"],"currentScene":"Main","desiredScene":"Main"}}"##.utf8)

  let snapshot = try WatchSnapshot.decode(data)

  #expect(snapshot.stream.state == "live")
  #expect(snapshot.stream.audioTier == 2)
  #expect(snapshot.chat.messages.first?.text == "Hello")
  #expect(snapshot.chat.messages.first?.badges == ["Moderator"])
  #expect(snapshot.chat.messages.first?.provider == "youtube")
  #expect(snapshot.viewers?.first?.count == 12)
  #expect(snapshot.viewers?.last?.provider == "youtube")
  #expect(snapshot.viewers?.last?.count == nil)
  #expect(snapshot.obs?.scenes == ["Main", "Be right back"])
  #expect(snapshot.obs?.currentScene == "Main")
}

@Test func decodesLegacySnapshotWithoutObsState() throws {
  let data = Data(#"{"version":1,"updatedAt":0,"stream":{"state":"idle","audioTier":0},"chat":{"statuses":{},"messages":[]}}"#.utf8)

  let snapshot = try WatchSnapshot.decode(data)
  #expect(snapshot.obs == nil)
  #expect(snapshot.viewers == nil)
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
