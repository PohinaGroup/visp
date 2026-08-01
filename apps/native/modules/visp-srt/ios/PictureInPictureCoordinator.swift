@preconcurrency import AVFoundation
import AVKit
import HaishinKit
import UIKit

private final class PictureInPictureVideoView: UIView {
  override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }

  var displayLayer: AVSampleBufferDisplayLayer {
    layer as! AVSampleBufferDisplayLayer
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    displayLayer.videoGravity = .resizeAspect
    backgroundColor = .black
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
}

private final class PictureInPictureFrameTap: MediaMixerOutput, @unchecked Sendable {
  let videoTrackId: UInt8? = UInt8.max
  let audioTrackId: UInt8? = nil

  private let layer: AVSampleBufferDisplayLayer

  init(layer: AVSampleBufferDisplayLayer) {
    self.layer = layer
  }

  func mixer(_ mixer: MediaMixer, didOutput sampleBuffer: CMSampleBuffer) {
    if layer.status == .failed {
      layer.flush()
    }
    layer.enqueue(sampleBuffer)
  }

  func selectTrack(_ id: UInt8?, mediaType: CMFormatDescription.MediaType) async {}

  func mixer(_ mixer: MediaMixer, didOutput buffer: AVAudioPCMBuffer, when: AVAudioTime) {}
}

@MainActor
final class PictureInPictureCoordinator: NSObject, @preconcurrency AVPictureInPictureControllerDelegate {
  var onFailure: (() -> Void)?

  var isActiveOrStarting: Bool {
    isStarting || controller?.isPictureInPictureActive == true
  }

  func waitForAutomaticStart() async -> Bool {
    guard !isActiveOrStarting else {
      return true
    }
    try? await Task.sleep(nanoseconds: 1_000_000_000)
    return isActiveOrStarting
  }

  private var controller: AVPictureInPictureController?
  private var frameTap: PictureInPictureFrameTap?
  private var interruptionObserver: (any NSObjectProtocol)?
  private var ignoreNextStop = false
  private var isStarting = false
  private let videoView = PictureInPictureVideoView(frame: .zero)

  func observeCaptureSession(_ session: AVCaptureSession) {
    if let interruptionObserver {
      NotificationCenter.default.removeObserver(interruptionObserver)
    }
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: .AVCaptureSessionWasInterrupted,
      object: session,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor in
        guard UIApplication.shared.applicationState == .background else {
          return
        }
        self?.onFailure?()
      }
    }
  }

  func activate(sourceView: UIView, mixer: MediaMixer) async -> Bool {
    guard controller == nil, AVPictureInPictureController.isPictureInPictureSupported() else {
      return controller != nil
    }
    ignoreNextStop = false

    let contentController = AVPictureInPictureVideoCallViewController()
    contentController.preferredContentSize = CGSize(width: 720, height: 1280)
    videoView.frame = contentController.view.bounds
    videoView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    contentController.view.addSubview(videoView)

    let source = AVPictureInPictureController.ContentSource(
      activeVideoCallSourceView: sourceView,
      contentViewController: contentController
    )
    let controller = AVPictureInPictureController(contentSource: source)
    controller.canStartPictureInPictureAutomaticallyFromInline = true
    controller.delegate = self

    let frameTap = PictureInPictureFrameTap(layer: videoView.displayLayer)
    await mixer.addOutput(frameTap)
    self.frameTap = frameTap
    self.controller = controller
    return true
  }

  func deactivate(mixer: MediaMixer?) async {
    ignoreNextStop = true
    isStarting = false
    if controller?.isPictureInPictureActive == true {
      controller?.stopPictureInPicture()
    }
    if let mixer, let frameTap {
      await mixer.removeOutput(frameTap)
    }
    frameTap = nil
    controller?.delegate = nil
    controller = nil
    videoView.displayLayer.flushAndRemoveImage()
  }

  func pictureInPictureControllerWillStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    isStarting = true
  }

  func pictureInPictureControllerDidStartPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    isStarting = false
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    failedToStartPictureInPictureWithError error: any Error
  ) {
    isStarting = false
    onFailure?()
  }

  func pictureInPictureControllerDidStopPictureInPicture(
    _ pictureInPictureController: AVPictureInPictureController
  ) {
    isStarting = false
    if ignoreNextStop {
      ignoreNextStop = false
      return
    }
    if UIApplication.shared.applicationState == .background {
      onFailure?()
    }
  }

  func pictureInPictureController(
    _ pictureInPictureController: AVPictureInPictureController,
    restoreUserInterfaceForPictureInPictureStopWithCompletionHandler completionHandler: @escaping (Bool) -> Void
  ) {
    completionHandler(true)
  }
}
