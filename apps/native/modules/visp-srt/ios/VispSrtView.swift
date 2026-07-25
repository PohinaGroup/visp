@preconcurrency import AVFoundation
@preconcurrency import Combine
internal import ExpoModulesCore
import HaishinKit
import SRTHaishinKit
import UIKit
import VideoToolbox

private enum StreamState: String {
  case idle
  case preparing
  case connecting
  case live
  case reconnecting
  case stopping
  case error
}

private enum VispSrtFailure: LocalizedError {
  case audioInputUnavailable
  case cameraUnavailable
  case configurationUnavailable
  case connectionFailed
  case invalidURL
  case permissionDenied

  var errorDescription: String? {
    switch self {
    case .audioInputUnavailable:
      return "That microphone is no longer available."
    case .cameraUnavailable:
      return "The camera or microphone is unavailable."
    case .configurationUnavailable:
      return "That camera setting is not available on this device."
    case .connectionFailed:
      return "VISP could not connect to the relay."
    case .invalidURL:
      return "Paste the SRT publish URL supplied by VISP."
    case .permissionDenied:
      return "Camera and microphone access is required."
    }
  }
}

private struct CameraFormatCapability {
  let frameRates: [Int]
  let height: Int
  let stabilizationFrameRates: [Int]
  let width: Int
}

private struct CameraCapability {
  let formats: [CameraFormatCapability]
  let name: String
  let position: AVCaptureDevice.Position
  let zoomLevels: [Double]
}

private struct VideoConfiguration {
  let frameRate: Int
  let height: Int
  let position: AVCaptureDevice.Position
  let width: Int
}

// Peak-level meter fed by the mixer's audio output. Buffers arrive on a single
// delivery task, so the throttle state needs no locking.
private final class AudioLevelTap: MediaMixerOutput, @unchecked Sendable {
  let videoTrackId: UInt8? = nil
  let audioTrackId: UInt8? = UInt8.max

  private let onLevel: @Sendable (Float) -> Void
  private var lastEmit = ContinuousClock.now

  init(onLevel: @escaping @Sendable (Float) -> Void) {
    self.onLevel = onLevel
  }

  func mixer(_ mixer: MediaMixer, didOutput sampleBuffer: CMSampleBuffer) {}

  func selectTrack(_ id: UInt8?, mediaType: CMFormatDescription.MediaType) async {}

  func mixer(_ mixer: MediaMixer, didOutput buffer: AVAudioPCMBuffer, when: AVAudioTime) {
    let now = ContinuousClock.now
    guard lastEmit.duration(to: now) > .milliseconds(150) else {
      return
    }
    let frames = Int(buffer.frameLength)
    guard frames > 0 else {
      return
    }
    var peak: Float = 0
    if let samples = buffer.floatChannelData?[0] {
      for index in 0..<frames {
        peak = max(peak, abs(samples[index]))
      }
    } else if let samples = buffer.int16ChannelData?[0] {
      for index in 0..<frames {
        peak = max(peak, abs(Float(samples[index])) / Float(Int16.max))
      }
    } else {
      return
    }
    lastEmit = now
    onLevel(min(peak, 1))
  }
}

@MainActor
final class VispSrtView: ExpoView {
  let onStateChange = EventDispatcher()
  let onAudioLevel = EventDispatcher()
  let onStats = EventDispatcher()

  private let preview = MTHKView(frame: .zero)
  private var audioInputID: String?
  private var connection: SRTConnection?
  private var connectionCancellable: AnyCancellable?
  private var configuration: VideoConfiguration?
  private var currentState: StreamState = .idle
  private var desiredURL: URL?
  private var intentionalStop = true
  private var imageStabilizationEnabled = true
  private var lastPktSndLossTotal: Int32 = 0
  private var lastPktSentTotal: Int64 = 0
  private var lockedOrientation: AVCaptureVideoOrientation?
  private var lastAppliedOrientation: AVCaptureVideoOrientation?
  private var mixer: MediaMixer?
  private var chatBitmap: CGImage?
  private var chatCorner = "bottom-left"
  private var chatGeneration = 0
  @ScreenActor private var chatScreenObject: ImageScreenObject?
  private static let chatImageCache = NSCache<NSURL, UIImage>()
  private var retryPolicy = RetryPolicy()
  private var retryTask: Task<Void, Never>?
  private var selectedZoom = 1.0
  private var statsTask: Task<Void, Never>?
  private var stream: SRTStream?
  private var videoBitrateCeiling = 3_500_000
  private var videoDevice: AVCaptureDevice?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = .black
    preview.videoGravity = .resizeAspectFill
    addSubview(preview)

    UIDevice.current.beginGeneratingDeviceOrientationNotifications()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(orientationDidChange),
      name: UIDevice.orientationDidChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(willResignActive),
      name: UIApplication.willResignActiveNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    UIDevice.current.endGeneratingDeviceOrientationNotifications()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    preview.frame = bounds
    // Programmatic ScreenOrientation.lockAsync changes the interface/layout
    // without a reliable UIDevice orientation event. Sync capture orientation
    // whenever our bounds aspect changes.
    applyVideoOrientationIfNeeded()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    guard window == nil else {
      return
    }
    Task { @MainActor [weak self] in
      await self?.suspend()
    }
  }

  @discardableResult
  func prepare() async throws -> Bool {
    guard mixer == nil else {
      return false
    }
    let requestedPermissions =
      AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined ||
      AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined
    emit(.preparing)

    guard await hasPermission(for: .video), await hasPermission(for: .audio) else {
      emit(.error, code: "permission-denied", message: VispSrtFailure.permissionDenied.localizedDescription)
      throw VispSrtFailure.permissionDenied
    }

    let configuration = try resolvedConfiguration()
    self.configuration = configuration
    guard
      let camera = captureDevice(position: configuration.position),
      let microphone = AVCaptureDevice.default(for: .audio)
    else {
      emit(.error, code: "device-unavailable", message: VispSrtFailure.cameraUnavailable.localizedDescription)
      throw VispSrtFailure.cameraUnavailable
    }

    do {
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(
        .playAndRecord,
        mode: .videoRecording,
        options: [.defaultToSpeaker, .allowBluetoothHFP]
      )
      try audioSession.setActive(true)
      let audioInput = audioInputID.flatMap { selectedID in
        audioSession.availableInputs?.first(where: { $0.uid == selectedID })
      }
      if audioInputID != nil && audioInput == nil {
        audioInputID = nil
      }
      try audioSession.setPreferredInput(audioInput)

      let mixer = MediaMixer()
      await mixer.setVideoMixerSettings(.init(mode: .offscreen))
      await mixer.setSessionPreset(.inputPriority)
      try await attachVideo(camera, to: mixer, configuration: configuration)
      try await mixer.attachAudio(microphone)
      try await mixer.setFrameRate(Double(configuration.frameRate))
      let orientation = currentOrientation()
      await mixer.setVideoOrientation(orientation)
      lastAppliedOrientation = orientation
      await mixer.addOutput(preview)
      await mixer.addOutput(AudioLevelTap { [weak self] level in
        Task { @MainActor in
          self?.onAudioLevel(["level": level])
        }
      })
      await mixer.startRunning()
      self.mixer = mixer
      await applyChatBitmap()
      emit(.idle)
      return requestedPermissions
    } catch {
      emit(.error, code: "capture-failed", message: VispSrtFailure.cameraUnavailable.localizedDescription)
      throw VispSrtFailure.cameraUnavailable
    }
  }

  func capabilities() throws -> [String: Any] {
    let cameras = cameraCapabilities()
    let selected = try resolvedConfiguration(cameras)
    let audioInputs = AVAudioSession.sharedInstance().availableInputs ?? []
    if let audioInputID, !audioInputs.contains(where: { $0.uid == audioInputID }) {
      self.audioInputID = nil
    }
    configuration = selected
    return [
      "audioInputs": audioInputs.map { ["id": $0.uid, "name": $0.portName] },
      "cameras": cameras.map { camera in
        [
          "id": camera.position.id,
          "name": camera.name,
          "zoomLevels": camera.zoomLevels,
          "formats": camera.formats.map {
            [
              "fps": $0.frameRates,
              "height": $0.height,
              "stabilizationFps": $0.stabilizationFrameRates,
              "width": $0.width,
            ]
          },
        ]
      },
      "selectedAudioInputId": audioInputID ?? Self.defaultAudioInputID,
      "selectedZoom": selectedZoom,
      "selected": selected.dictionary,
    ]
  }

  func updateChatOverlay(messages: [[String: Any]], corner: String) async {
    chatGeneration += 1
    let generation = chatGeneration
    var images: [String: UIImage] = [:]
    let urls = messages
      .flatMap { ($0["fragments"] as? [[String: Any]]) ?? [] }
      .compactMap { $0["url"] as? String }
    for value in Set(urls) {
      if let image = await loadChatImage(value) {
        images[value] = image
      }
    }
    guard generation == chatGeneration else {
      return
    }
    chatCorner = validChatCorner(corner) ? corner : "bottom-left"
    chatBitmap = renderChatOverlay(messages: Array(messages.suffix(4)), images: images)?.cgImage
    await applyChatBitmap()
  }

  func clearChatOverlay() async {
    chatGeneration += 1
    chatBitmap = nil
    await applyChatBitmap()
  }

  private func loadChatImage(_ value: String) async -> UIImage? {
    guard
      let url = URL(string: value),
      url.scheme == "https",
      url.host == "static-cdn.jtvnw.net" || url.host == "files.kick.com"
    else {
      return nil
    }
    if let cached = Self.chatImageCache.object(forKey: url as NSURL) {
      return cached
    }
    do {
      var request = URLRequest(url: url)
      request.timeoutInterval = 5
      let (data, response) = try await URLSession.shared.data(for: request)
      guard
        data.count <= 1_500_000,
        (response as? HTTPURLResponse)?.statusCode == 200,
        let decoded = UIImage(data: data),
        let firstFrame = decoded.cgImage.map(UIImage.init(cgImage:))
      else {
        return nil
      }
      Self.chatImageCache.setObject(firstFrame, forKey: url as NSURL, cost: data.count)
      return firstFrame
    } catch {
      return nil
    }
  }

  private func renderChatOverlay(
    messages: [[String: Any]],
    images: [String: UIImage]
  ) -> UIImage? {
    guard !messages.isEmpty else {
      return nil
    }
    let width: CGFloat = 620
    let rowHeight: CGFloat = 82
    let padding: CGFloat = 12
    let size = CGSize(width: width, height: rowHeight * CGFloat(messages.count) + padding * 2)
    // Scale 1 keeps the bitmap in video-canvas pixels; the device scale would triple it.
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    return renderer.image { context in
      context.cgContext.clear(CGRect(origin: .zero, size: size))
      for (index, message) in messages.enumerated() {
        let opacity = max(0, min(1, (message["opacity"] as? NSNumber)?.doubleValue ?? 1))
        context.cgContext.saveGState()
        context.cgContext.setAlpha(opacity)
        let y = padding + CGFloat(index) * rowHeight
        let row = CGRect(x: 0, y: y, width: width, height: rowHeight - 6)
        UIColor.black.withAlphaComponent(0.68).setFill()
        UIBezierPath(roundedRect: row, cornerRadius: 14).fill()

        let sender = message["sender"] as? [String: Any]
        let senderName = String((sender?["name"] as? String ?? "viewer").prefix(64))
        let senderColor = UIColor(chatHex: sender?["color"] as? String) ?? .white
        senderName.draw(
          at: CGPoint(x: 14, y: y + 9),
          withAttributes: [.font: UIFont.boldSystemFont(ofSize: 18), .foregroundColor: senderColor]
        )

        var x: CGFloat = 14
        let contentY = y + 38
        for fragment in (message["fragments"] as? [[String: Any]] ?? []).prefix(32) {
          let text = String((fragment["text"] as? String ?? "").prefix(180))
          if fragment["type"] as? String == "emote", let url = fragment["url"] as? String,
             let image = images[url] {
            if x + 30 > width - 14 { break }
            image.draw(in: CGRect(x: x, y: contentY - 3, width: 30, height: 30))
            x += 34
          } else {
            let attributes: [NSAttributedString.Key: Any] = [
              .font: UIFont.systemFont(ofSize: 17),
              .foregroundColor: UIColor.white,
            ]
            let available = max(0, width - 14 - x)
            guard available > 0 else { break }
            let clipped = text as NSString
            clipped.draw(
              with: CGRect(x: x, y: contentY, width: available, height: 28),
              options: [.truncatesLastVisibleLine, .usesLineFragmentOrigin],
              attributes: attributes,
              context: nil
            )
            x += min(available, clipped.size(withAttributes: attributes).width)
          }
        }
        context.cgContext.restoreGState()
      }
    }
  }

  private func applyChatBitmap() async {
    guard let mixer else {
      return
    }
    let bitmap = chatBitmap
    let corner = chatCorner
    let screen = await mixer.screen
    await Task { @ScreenActor [weak self] in
      guard let self else { return }
      let object: ImageScreenObject
      if let current = self.chatScreenObject {
        object = current
      } else {
        object = ImageScreenObject()
        try? screen.addChild(object)
        self.chatScreenObject = object
      }
      object.cgImage = bitmap
      object.size = bitmap.map { CGSize(width: CGFloat($0.width), height: CGFloat($0.height)) } ?? .zero
      object.isVisible = bitmap != nil
      // Title-safe margin; also keeps the overlay visible when the aspect-fill preview crops edges.
      object.layoutMargin = .init(top: 64, left: 64, bottom: 64, right: 64)
      object.horizontalAlignment = corner.hasSuffix("right") ? .right : .left
      object.verticalAlignment = corner.hasPrefix("top") ? .top : .bottom
      object.invalidateLayout()
    }.value
  }

  private func validChatCorner(_ value: String) -> Bool {
    ["top-left", "top-right", "bottom-left", "bottom-right"].contains(value)
  }

  func configure(
    cameraID: String,
    width: Int,
    height: Int,
    frameRate: Int,
    maxVideoBitrateKbps: Int
  ) async throws {
    guard currentState == .idle || currentState == .error else {
      throw VispSrtFailure.configurationUnavailable
    }
    let cameras = cameraCapabilities()
    guard
      let position = AVCaptureDevice.Position(id: cameraID),
      let camera = cameras.first(where: { $0.position == position }),
      let format = camera.formats.first(where: { $0.width == width && $0.height == height }),
      format.frameRates.contains(frameRate)
    else {
      emit(.error, code: "configuration-unavailable", message: VispSrtFailure.configurationUnavailable.localizedDescription)
      throw VispSrtFailure.configurationUnavailable
    }
    if configuration?.position != position {
      selectedZoom = defaultZoom(camera.zoomLevels)
    }
    configuration = VideoConfiguration(
      frameRate: frameRate,
      height: height,
      position: position,
      width: width
    )
    videoBitrateCeiling = max(500, maxVideoBitrateKbps) * 1_000
    await suspend()
    try await prepare()
  }

  func configureAudioInput(_ inputID: String) async throws {
    guard currentState == .idle || currentState == .error else {
      throw VispSrtFailure.configurationUnavailable
    }
    let selectedID = inputID == Self.defaultAudioInputID ? nil : inputID
    if let selectedID,
       AVAudioSession.sharedInstance().availableInputs?.contains(where: { $0.uid == selectedID }) != true {
      emit(.error, code: "audio-input-unavailable", message: VispSrtFailure.audioInputUnavailable.localizedDescription)
      throw VispSrtFailure.audioInputUnavailable
    }
    audioInputID = selectedID
    await suspend()
    try await prepare()
  }

  func switchCamera(_ cameraID: String) async throws {
    guard
      currentState != .idle,
      currentState != .stopping,
      currentState != .error,
      let mixer,
      let current = configuration,
      let position = AVCaptureDevice.Position(id: cameraID),
      position != current.position,
      let capability = cameraCapabilities().first(where: { $0.position == position }),
      capability.formats.contains(where: {
        $0.width == current.width &&
          $0.height == current.height &&
          $0.frameRates.contains(current.frameRate)
      }),
      let camera = captureDevice(position: position)
    else {
      if AVCaptureDevice.Position(id: cameraID) == configuration?.position {
        return
      }
      throw VispSrtFailure.configurationUnavailable
    }
    let previousZoom = selectedZoom
    do {
      selectedZoom = defaultZoom(capability.zoomLevels)
      let next = VideoConfiguration(
        frameRate: current.frameRate,
        height: current.height,
        position: position,
        width: current.width
      )
      try await attachVideo(camera, to: mixer, configuration: next)
      configuration = next
    } catch {
      selectedZoom = previousZoom
      if let previous = captureDevice(position: current.position) {
        do {
          try await attachVideo(previous, to: mixer, configuration: current)
        } catch {
          emit(.error, code: "capture-failed", message: VispSrtFailure.cameraUnavailable.localizedDescription)
        }
      }
      throw VispSrtFailure.configurationUnavailable
    }
  }

  func setZoom(_ level: Double) throws {
    guard
      currentState != .preparing,
      currentState != .stopping,
      let device = videoDevice,
      let supported = nativeZoomLevels(for: device).first(where: { abs($0 - level) < 0.051 })
    else {
      throw VispSrtFailure.configurationUnavailable
    }
    try applyZoom(supported, to: device)
    selectedZoom = supported
  }

  func setImageStabilization(_ enabled: Bool) async throws {
    let previous = imageStabilizationEnabled
    imageStabilizationEnabled = enabled
    guard let mixer else {
      return
    }
    if enabled && !supportsImageStabilization(configuration) {
      imageStabilizationEnabled = previous
      throw VispSrtFailure.configurationUnavailable
    }
    do {
      try await mixer.configuration(video: 0) { video in
        video.preferredVideoStabilizationMode = enabled ? .standard : .off
      }
    } catch {
      imageStabilizationEnabled = previous
      throw error
    }
  }

  func start(_ value: String) async throws {
    let url = try validatedURL(value)
    try await prepare()
    guard currentState != .live, currentState != .connecting, currentState != .reconnecting else {
      return
    }

    intentionalStop = false
    desiredURL = url
    retryPolicy.reset()
    lockedOrientation = currentOrientation()
    if let mixer, let lockedOrientation {
      lastAppliedOrientation = lockedOrientation
      await mixer.setVideoOrientation(lockedOrientation)
    }

    emit(.connecting)
    do {
      try await openConnection(to: url)
    } catch {
      beginRetries()
    }
  }

  func stop() async {
    intentionalStop = true
    retryPolicy.cancel()
    retryTask?.cancel()
    retryTask = nil
    stopStatsLoop()

    if currentState != .idle {
      emit(.stopping)
    }
    await closeConnection()
    UIApplication.shared.isIdleTimerDisabled = false
    desiredURL = nil
    lockedOrientation = nil
    if let mixer {
      let orientation = currentOrientation()
      lastAppliedOrientation = orientation
      await mixer.setVideoOrientation(orientation)
    }
    emit(.idle)
  }

  private func openConnection(to url: URL) async throws {
    guard let mixer else {
      throw VispSrtFailure.cameraUnavailable
    }
    await closeConnection()

    let connection = SRTConnection()
    let stream = SRTStream(connection: connection)
    self.connection = connection
    self.stream = stream

    let orientation = lockedOrientation ?? currentOrientation()
    let landscape = orientation == .landscapeLeft || orientation == .landscapeRight
    let configuration = try resolvedConfiguration()
    let size = landscape
      ? CGSize(width: configuration.width, height: configuration.height)
      : CGSize(width: configuration.height, height: configuration.width)

    do {
      try await stream.setVideoSettings(
        VideoCodecSettings(
          videoSize: size,
          bitRate: videoBitrateCeiling,
          profileLevel: kVTProfileLevel_H264_Baseline_AutoLevel as String,
          maxKeyFrameIntervalDuration: 2,
          allowFrameReordering: false,
          isHardwareAcceleratedEnabled: true,
          expectedFrameRate: Float64(configuration.frameRate)
        )
      )
      try await stream.setAudioSettings(
        AudioCodecSettings(
          bitRate: 96_000,
          downmix: true,
          channelMap: [0],
          sampleRate: 48_000,
          format: .aac
        )
      )
      await stream.setBitRateStrategy(
        StreamVideoAdaptiveBitRateStrategy(mamimumVideoBitrate: videoBitrateCeiling)
      )
      await stream.setExpectedMedias([.video, .audio])
      await mixer.addOutput(stream)
      try await connection.connect(url)
      await stream.publish()
      guard await connection.connected else {
        throw VispSrtFailure.connectionFailed
      }
    } catch {
      await closeConnection()
      throw VispSrtFailure.connectionFailed
    }

    connectionCancellable = await connection.$connected
      .receive(on: DispatchQueue.main)
      .sink { [weak self] connected in
        guard !connected else {
          return
        }
        Task { @MainActor in
          await self?.handleUnexpectedDisconnect()
        }
      }

    UIApplication.shared.isIdleTimerDisabled = true
    startStatsLoop()
    emit(.live)
  }

  private func closeConnection() async {
    stopStatsLoop()
    connectionCancellable?.cancel()
    connectionCancellable = nil
    if let mixer, let stream {
      await mixer.removeOutput(stream)
      await stream.close()
    }
    await connection?.close()
    stream = nil
    connection = nil
  }

  private func handleUnexpectedDisconnect() async {
    guard !intentionalStop, currentState == .live else {
      return
    }
    await closeConnection()
    beginRetries()
  }

  private func beginRetries() {
    retryTask?.cancel()
    retryTask = Task { @MainActor [weak self] in
      guard let self else {
        return
      }
      while let retry = retryPolicy.next() {
        emit(.reconnecting, attempt: retry.attempt)
        do {
          try await Task.sleep(nanoseconds: retry.nanoseconds)
        } catch {
          return
        }
        guard !intentionalStop, let desiredURL else {
          return
        }
        do {
          try await openConnection(to: desiredURL)
          return
        } catch {
          continue
        }
      }
      UIApplication.shared.isIdleTimerDisabled = false
      emit(.error, code: "connection-failed", message: VispSrtFailure.connectionFailed.localizedDescription)
    }
  }

  private func suspend() async {
    await stop()
    if let mixer {
      await mixer.stopRunning()
    }
    await Task { @ScreenActor [weak self] in
      self?.chatScreenObject = nil
    }.value
    mixer = nil
    videoDevice = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  private func attachVideo(
    _ camera: AVCaptureDevice,
    to mixer: MediaMixer,
    configuration: VideoConfiguration
  ) async throws {
    let stabilizationEnabled = imageStabilizationEnabled
    try await mixer.attachVideo(camera) { video in
      guard let device = video.device else {
        throw VispSrtFailure.configurationUnavailable
      }
      let candidates = device.formats.filter {
          let dimensions = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
          return dimensions.width == configuration.width &&
            dimensions.height == configuration.height &&
            $0.videoSupportedFrameRateRanges.contains(where: {
              $0.minFrameRate <= Double(configuration.frameRate) &&
                Double(configuration.frameRate) <= $0.maxFrameRate
            })
      }
      // Prefer a stabilizable format even while off so the live switch can turn it on.
      guard let format = candidates.first(where: {
        $0.isVideoStabilizationModeSupported(.standard)
      }) ?? candidates.first else {
        throw VispSrtFailure.configurationUnavailable
      }
      try device.lockForConfiguration()
      defer { device.unlockForConfiguration() }
      device.activeFormat = format
      let duration = CMTime(value: 1, timescale: CMTimeScale(configuration.frameRate))
      device.activeVideoMinFrameDuration = duration
      device.activeVideoMaxFrameDuration = duration
      video.preferredVideoStabilizationMode =
        stabilizationEnabled && format.isVideoStabilizationModeSupported(.standard)
          ? .standard
          : .off
    }
    let levels = nativeZoomLevels(for: camera)
    let zoom = levels.first(where: { abs($0 - selectedZoom) < 0.051 }) ?? defaultZoom(levels)
    try applyZoom(zoom, to: camera)
    videoDevice = camera
    selectedZoom = zoom
  }

  private func cameraCapabilities() -> [CameraCapability] {
    [AVCaptureDevice.Position.back, .front].compactMap { position in
      guard let device = captureDevice(position: position) else {
        return nil
      }
      var formats: [
        String: (
          width: Int,
          height: Int,
          frameRates: Set<Int>,
          stabilizationFrameRates: Set<Int>
        )
      ] = [:]
      for format in device.formats {
        let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
        let width = Int(dimensions.width)
        let height = Int(dimensions.height)
        guard
          width.isMultiple(of: 2),
          height.isMultiple(of: 2),
          max(width, height) <= 3840,
          min(width, height) >= 480
        else {
          continue
        }
        let frameRates = Set(
          format.videoSupportedFrameRateRanges.flatMap { range in
            let endpoints = [Int(range.minFrameRate.rounded()), Int(range.maxFrameRate.rounded())]
            return (Self.commonFrameRates + endpoints).filter {
              range.minFrameRate <= Double($0) && Double($0) <= range.maxFrameRate
            }
          }
        )
        guard !frameRates.isEmpty else {
          continue
        }
        let stabilizationFrameRates = format.isVideoStabilizationModeSupported(.standard)
          ? frameRates
          : []
        let key = "\(width)x\(height)"
        if let existing = formats[key] {
          formats[key] = (
            width,
            height,
            existing.frameRates.union(frameRates),
            existing.stabilizationFrameRates.union(stabilizationFrameRates)
          )
        } else {
          formats[key] = (width, height, frameRates, stabilizationFrameRates)
        }
      }
      return CameraCapability(
        formats: formats.values.map {
          CameraFormatCapability(
            frameRates: $0.frameRates.sorted(),
            height: $0.height,
            stabilizationFrameRates: $0.stabilizationFrameRates.sorted(),
            width: $0.width
          )
        }.sorted { $0.width * $0.height < $1.width * $1.height },
        name: position == .front ? "Front camera" : "Rear camera",
        position: position,
        zoomLevels: nativeZoomLevels(for: device)
      )
    }.filter { !$0.formats.isEmpty }
  }

  private func supportsImageStabilization(_ configuration: VideoConfiguration?) -> Bool {
    guard let configuration else {
      return false
    }
    return cameraCapabilities()
      .first(where: { $0.position == configuration.position })?
      .formats
      .first(where: {
        $0.width == configuration.width && $0.height == configuration.height
      })?
      .stabilizationFrameRates
      .contains(configuration.frameRate) == true
  }

  private func captureDevice(position: AVCaptureDevice.Position) -> AVCaptureDevice? {
    let deviceTypes: [AVCaptureDevice.DeviceType] = position == .back
      ? [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera]
      : [.builtInWideAngleCamera]
    return deviceTypes.lazy.compactMap {
      AVCaptureDevice.default($0, for: .video, position: position)
    }.first
  }

  private func nativeZoomLevels(for device: AVCaptureDevice) -> [Double] {
    let multiplier = zoomDisplayMultiplier(for: device)
    var rawLevels = [device.minAvailableVideoZoomFactor, 1 / multiplier]
    rawLevels += device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat($0.doubleValue) }
    rawLevels += device.formats.flatMap(\.secondaryNativeResolutionZoomFactors)
    let displayLevels = rawLevels
      .filter {
        device.minAvailableVideoZoomFactor <= $0 && $0 <= device.maxAvailableVideoZoomFactor
      }
      .map { (Double($0 * multiplier) * 10).rounded() / 10 }
      .filter { $0 > 0 }
    return Array(Set(displayLevels)).sorted()
  }

  private func zoomDisplayMultiplier(for device: AVCaptureDevice) -> CGFloat {
    if #available(iOS 18.0, *) {
      return device.displayVideoZoomFactorMultiplier
    }
    guard
      device.constituentDevices.first?.deviceType == .builtInUltraWideCamera,
      let firstSwitch = device.virtualDeviceSwitchOverVideoZoomFactors.first?.doubleValue,
      firstSwitch > 0
    else {
      return 1
    }
    return 1 / firstSwitch
  }

  private func defaultZoom(_ levels: [Double]) -> Double {
    levels.min(by: { abs($0 - 1) < abs($1 - 1) }) ?? 1
  }

  private func applyZoom(_ level: Double, to device: AVCaptureDevice) throws {
    let rawLevel = CGFloat(level) / zoomDisplayMultiplier(for: device)
    guard
      device.minAvailableVideoZoomFactor <= rawLevel,
      rawLevel <= device.maxAvailableVideoZoomFactor
    else {
      throw VispSrtFailure.configurationUnavailable
    }
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    device.videoZoomFactor = rawLevel
  }

  private func resolvedConfiguration(_ cameras: [CameraCapability]? = nil) throws -> VideoConfiguration {
    let cameras = cameras ?? cameraCapabilities()
    if let configuration,
       let camera = cameras.first(where: { $0.position == configuration.position }),
       let format = camera.formats.first(where: {
         $0.width == configuration.width && $0.height == configuration.height
       }),
       format.frameRates.contains(configuration.frameRate) {
      return configuration
    }
    guard let camera = cameras.first(where: { $0.position == .back }) ?? cameras.first else {
      throw VispSrtFailure.cameraUnavailable
    }
    let format = camera.formats.first(where: { $0.width == 1280 && $0.height == 720 }) ??
      camera.formats.first(where: { $0.width == 1920 && $0.height == 1080 }) ?? camera.formats[0]
    return VideoConfiguration(
      frameRate: format.frameRates.contains(30) ? 30 : format.frameRates.last!,
      height: format.height,
      position: camera.position,
      width: format.width
    )
  }

  private func hasPermission(for mediaType: AVMediaType) async -> Bool {
    switch AVCaptureDevice.authorizationStatus(for: mediaType) {
    case .authorized:
      return true
    case .notDetermined:
      return await AVCaptureDevice.requestAccess(for: mediaType)
    default:
      return false
    }
  }

  private func validatedURL(_ value: String) throws -> URL {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard
      let components = URLComponents(string: trimmed),
      components.scheme?.lowercased() == "srt",
      components.host?.isEmpty == false,
      let port = components.port,
      (1...65_535).contains(port),
      components.queryItems?.first(where: { $0.name == "streamid" })?.value?.hasPrefix("publish:") == true,
      let url = URL(string: trimmed)
    else {
      emit(.error, code: "invalid-url", message: VispSrtFailure.invalidURL.localizedDescription)
      throw VispSrtFailure.invalidURL
    }
    return url
  }

  private func currentOrientation() -> AVCaptureVideoOrientation {
    let layoutLandscape = bounds.width > bounds.height && bounds != .zero
    if let interfaceOrientation = window?.windowScene?.interfaceOrientation,
       let orientation = DeviceUtil.videoOrientation(by: interfaceOrientation) {
      let interfaceLandscape =
        orientation == .landscapeLeft || orientation == .landscapeRight
      // Prefer interface orientation when it matches the laid-out aspect. After
      // lockAsync, layout can update before UIDevice notifications fire.
      if !layoutLandscape || interfaceLandscape {
        return orientation
      }
    }
    if layoutLandscape {
      return .landscapeRight
    }
    if bounds.height > bounds.width {
      return .portrait
    }
    return DeviceUtil.videoOrientation(by: UIDevice.current.orientation) ?? .portrait
  }

  private func applyVideoOrientationIfNeeded() {
    guard lockedOrientation == nil, mixer != nil else {
      return
    }
    let orientation = currentOrientation()
    guard orientation != lastAppliedOrientation else {
      return
    }
    lastAppliedOrientation = orientation
    Task { @MainActor [weak self] in
      guard let self, let mixer = self.mixer, self.lockedOrientation == nil else {
        return
      }
      await mixer.setVideoOrientation(orientation)
    }
  }

  private func emit(
    _ state: StreamState,
    attempt: Int? = nil,
    code: String? = nil,
    message: String? = nil
  ) {
    currentState = state
    var payload: [String: Any] = ["state": state.rawValue]
    payload["attempt"] = attempt
    payload["code"] = code
    payload["message"] = message
    onStateChange(payload)
  }

  private func startStatsLoop() {
    stopStatsLoop()
    lastPktSndLossTotal = 0
    lastPktSentTotal = 0
    statsTask = Task { @MainActor [weak self] in
      while let self, !Task.isCancelled {
        await self.emitStats()
        try? await Task.sleep(nanoseconds: 1_000_000_000)
      }
    }
  }

  private func stopStatsLoop() {
    statsTask?.cancel()
    statsTask = nil
  }

  private func emitStats() async {
    guard currentState == .live, let connection, let stream else {
      return
    }
    guard let performance = await connection.performanceData else {
      return
    }
    let sentDelta = max(0, performance.pktSentTotal - lastPktSentTotal)
    let lossDelta = max(0, Int64(performance.pktSndLossTotal) - Int64(lastPktSndLossTotal))
    lastPktSentTotal = performance.pktSentTotal
    lastPktSndLossTotal = performance.pktSndLossTotal
    let packetLossPct: Double
    if sentDelta + lossDelta > 0 {
      packetLossPct = 100.0 * Double(lossDelta) / Double(sentDelta + lossDelta)
    } else {
      packetLossPct = 0
    }
    let targetBitrateKbps = await stream.videoSettings.bitRate / 1_000
    let bitrateKbps = max(0, Int((performance.mbpsSendRate * 1_000).rounded()))
    let rttMs = max(0, Int(performance.msRTT.rounded()))
    onStats([
      "bitrateKbps": bitrateKbps,
      "targetBitrateKbps": targetBitrateKbps,
      "rttMs": rttMs,
      "packetLossPct": packetLossPct,
    ])
  }

  @objc private func orientationDidChange() {
    applyVideoOrientationIfNeeded()
  }

  @objc private func willResignActive() {
    Task { @MainActor [weak self] in
      await self?.suspend()
    }
  }

  private static let commonFrameRates = [15, 24, 25, 30, 50, 60, 120]
  private static let defaultAudioInputID = "default"
}

private extension UIColor {
  convenience init?(chatHex: String?) {
    guard
      let chatHex,
      chatHex.range(of: "^#[0-9A-Fa-f]{6}$", options: .regularExpression) != nil,
      let value = Int(chatHex.dropFirst(), radix: 16)
    else {
      return nil
    }
    self.init(
      red: CGFloat((value >> 16) & 0xff) / 255,
      green: CGFloat((value >> 8) & 0xff) / 255,
      blue: CGFloat(value & 0xff) / 255,
      alpha: 1
    )
  }
}

private extension AVCaptureDevice.Position {
  init?(id: String) {
    switch id {
    case "back": self = .back
    case "front": self = .front
    default: return nil
    }
  }

  var id: String { self == .front ? "front" : "back" }
}

private extension VideoConfiguration {
  var dictionary: [String: Any] {
    ["cameraId": position.id, "fps": frameRate, "height": height, "width": width]
  }
}
