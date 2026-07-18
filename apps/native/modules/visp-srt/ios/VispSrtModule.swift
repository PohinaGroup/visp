internal import ExpoModulesCore

final class VispSrtModule: Module {
  func definition() -> ModuleDefinition {
    Name("VispSrt")

    Function("syncWatchSnapshot") { (json: String) in
      WatchBridge.shared.sync(json)
    }

    View(VispSrtView.self) {
      Events("onStateChange", "onAudioLevel")

      AsyncFunction("configure") { (
        view: VispSrtView,
        cameraID: String,
        width: Int,
        height: Int,
        frameRate: Int
      ) in
        try await view.configure(
          cameraID: cameraID,
          width: width,
          height: height,
          frameRate: frameRate
        )
      }

      AsyncFunction("configureAudioInput") { (
        view: VispSrtView,
        audioInputID: String
      ) in
        try await view.configureAudioInput(audioInputID)
      }

      AsyncFunction("switchCamera") { (
        view: VispSrtView,
        cameraID: String
      ) in
        try await view.switchCamera(cameraID)
      }

      AsyncFunction("setZoom") { (view: VispSrtView, level: Double) in
        try await view.setZoom(level)
      }

      AsyncFunction("setImageStabilization") { (view: VispSrtView, enabled: Bool) in
        try await view.setImageStabilization(enabled)
      }

      AsyncFunction("getCapabilities") { (view: VispSrtView) in
        try await view.capabilities()
      }

      AsyncFunction("prepare") { (view: VispSrtView) in
        try await view.prepare()
      }

      AsyncFunction("updateChatOverlay") { (
        view: VispSrtView,
        messages: [[String: Any]],
        corner: String
      ) in
        await view.updateChatOverlay(messages: messages, corner: corner)
      }

      AsyncFunction("clearChatOverlay") { (view: VispSrtView) in
        await view.clearChatOverlay()
      }

      AsyncFunction("start") { (view: VispSrtView, url: String) in
        try await view.start(url)
      }

      AsyncFunction("stop") { (view: VispSrtView) in
        await view.stop()
      }
    }
  }
}
