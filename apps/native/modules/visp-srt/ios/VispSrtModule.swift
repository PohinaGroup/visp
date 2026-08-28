import AVFoundation
internal import ExpoModulesCore
import UIKit

final class VispSrtModule: Module {
  private var audioRouteObserver: NSObjectProtocol?

  func definition() -> ModuleDefinition {
    Name("VispSrt")

    Events("onWatchSceneCommand", "onAudioRouteChange")

    OnStartObserving {
      WatchBridge.shared.setSceneCommandHandler { [weak self] requestID, scene in
        DispatchQueue.main.async {
          self?.sendEvent("onWatchSceneCommand", ["requestId": requestID, "scene": scene])
        }
      }
      if self.audioRouteObserver == nil {
        self.audioRouteObserver = NotificationCenter.default.addObserver(
          forName: AVAudioSession.routeChangeNotification,
          object: nil,
          queue: .main
        ) { [weak self] _ in
          self?.sendEvent("onAudioRouteChange", [
            "name": AVAudioSession.sharedInstance().currentRoute.outputs.first?.portName
          ])
        }
      }
    }

    OnStopObserving {
      WatchBridge.shared.setSceneCommandHandler(nil)
      if let observer = self.audioRouteObserver {
        NotificationCenter.default.removeObserver(observer)
        self.audioRouteObserver = nil
      }
    }

    Function("syncWatchSnapshot") { (json: String) in
      WatchBridge.shared.sync(json)
    }

    Function("replyToWatchSceneCommand") { (requestID: String, error: String?) in
      WatchBridge.shared.replyToSceneCommand(requestID: requestID, error: error)
    }

    Function("currentAudioOutput") {
      AVAudioSession.sharedInstance().currentRoute.outputs.first?.portName
    }

    View(VispRoutePickerView.self) {
      Prop("activeTintColor") { (view: VispRoutePickerView, color: UIColor?) in
        view.routePicker.activeTintColor = color
      }
      Prop("tintColor") { (view: VispRoutePickerView, color: UIColor?) in
        view.routePicker.tintColor = color
      }
    }

    View(VispSrtView.self) {
      Events("onStateChange", "onAudioLevel", "onStats")

      AsyncFunction("configure") { (
        view: VispSrtView,
        cameraID: String,
        width: Int,
        height: Int,
        frameRate: Int,
        maxVideoBitrateKbps: Int,
        bondingMode: String?
      ) in
        try await view.configure(
          cameraID: cameraID,
          width: width,
          height: height,
          frameRate: frameRate,
          maxVideoBitrateKbps: maxVideoBitrateKbps,
          bondingMode: bondingMode ?? "off"
        )
      }

      AsyncFunction("configureAudioInput") { (
        view: VispSrtView,
        audioInputID: String
      ) in
        try await view.configureAudioInput(audioInputID)
      }

      AsyncFunction("setAudioIsolation") { (
        view: VispSrtView,
        mode: String,
        serverURL: String?,
        authCookie: String?
      ) in
        await view.setAudioIsolation(
          mode: mode,
          serverURL: serverURL,
          authCookie: authCookie
        )
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

      AsyncFunction("setVideoBitrate") { (view: VispSrtView, bitrateKbps: Int) in
        try await view.setVideoBitrate(bitrateKbps)
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

      AsyncFunction("updateCaptionsOverlay") { (view: VispSrtView, text: String) in
        await view.updateCaptionsOverlay(text)
      }

      AsyncFunction("clearCaptionsOverlay") { (view: VispSrtView) in
        await view.clearCaptionsOverlay()
      }

      AsyncFunction("startLiveCaptions") { (
        view: VispSrtView,
        language: String,
        better: Bool,
        wsUrl: String?
      ) -> Bool in
        await view.startLiveCaptions(language: language, better: better, wsUrl: wsUrl)
      }

      AsyncFunction("stopLiveCaptions") { (view: VispSrtView) in
        await view.stopLiveCaptions()
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
