import SwiftUI

@main
struct VISPWatchApp: App {
  @StateObject private var session = WatchSessionModel()

  var body: some Scene {
    WindowGroup {
      ContentView(session: session)
    }
  }
}
