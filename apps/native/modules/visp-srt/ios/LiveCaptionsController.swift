@preconcurrency import AVFoundation
import Foundation
import HaishinKit
import Speech

/// On-device SFSpeechRecognizer or ElevenLabs Scribe realtime, updating the burned-in caption overlay.
final class LiveCaptionsController: @unchecked Sendable {
  private let lock = NSLock()
  private weak var view: VispSrtView?
  private var mode: Mode = .off
  private var language = "en"
  private var wsUrl: URL?
  private var speechRecognizer: SFSpeechRecognizer?
  private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
  private var recognitionTask: SFSpeechRecognitionTask?
  private var webSocket: URLSessionWebSocketTask?
  private var session: URLSession?
  private var downConverter: AVAudioConverter?
  private var downFormat: AVAudioFormat?
  private var pcmAccum = Data()
  private let sampleRate: Double = 16_000
  private let chunkSamples = 3_200
  private var lastCaption = ""

  enum Mode {
    case off
    case native
    case better
  }

  func attach(view: VispSrtView) {
    lock.lock()
    self.view = view
    lock.unlock()
  }

  func start(language: String, better: Bool, wsUrl: String?) async {
    await stop()
    // JS maps LanguageCode → BCP-47 locale before calling; accept either form.
    let localeId: String
    let languageCode: String
    if language.hasPrefix("fi") {
      localeId = "fi-FI"
      languageCode = "fi"
    } else {
      localeId = "en-US"
      languageCode = "en"
    }
    lock.lock()
    self.language = languageCode
    self.mode = better ? .better : .native
    self.wsUrl = wsUrl.flatMap(URL.init(string:))
    lock.unlock()

    if better {
      await startScribe()
    } else {
      await startNative(localeId: localeId)
    }
  }

  func stop() async {
    lock.lock()
    mode = .off
    let task = recognitionTask
    let request = recognitionRequest
    let socket = webSocket
    let session = session
    recognitionTask = nil
    recognitionRequest = nil
    webSocket = nil
    self.session = nil
    speechRecognizer = nil
    downConverter = nil
    downFormat = nil
    pcmAccum.removeAll(keepingCapacity: false)
    lastCaption = ""
    lock.unlock()

    request?.endAudio()
    task?.cancel()
    socket?.cancel(with: .goingAway, reason: nil)
    session?.invalidateAndCancel()
    await publish("")
  }

  func handleInput(track: UInt8, buffer: AVAudioPCMBuffer, when: AVAudioTime) {
    lock.lock()
    let mode = mode
    let request = recognitionRequest
    lock.unlock()
    guard track == 0 else { return }

    switch mode {
    case .off:
      return
    case .native:
      request?.append(buffer)
    case .better:
      sendScribeChunk(buffer)
    }
  }

  private func startNative(localeId: String) async {
    let authorized = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
      SFSpeechRecognizer.requestAuthorization { status in
        continuation.resume(returning: status == .authorized)
      }
    }
    guard authorized else { return }

    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId))
    guard let recognizer, recognizer.isAvailable else { return }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if #available(iOS 16.0, *) {
      request.addsPunctuation = true
    }

    lock.lock()
    speechRecognizer = recognizer
    recognitionRequest = request
    lock.unlock()

    recognitionTask = recognizer.recognitionTask(with: request) { [weak self] result, error in
      guard let self else { return }
      if let result {
        let text = result.bestTranscription.formattedString
        Task { await self.publish(text) }
        if result.isFinal {
          Task { await self.restartNativeIfNeeded(localeId: localeId) }
        }
      } else if error != nil {
        Task { await self.restartNativeIfNeeded(localeId: localeId) }
      }
    }
  }

  private func restartNativeIfNeeded(localeId: String) async {
    lock.lock()
    let active = mode == .native
    lock.unlock()
    guard active else { return }
    await stop()
    lock.lock()
    mode = .native
    lock.unlock()
    await startNative(localeId: localeId)
  }

  private func startScribe() async {
    lock.lock()
    let url = wsUrl
    lock.unlock()
    guard let url else { return }

    let session = URLSession(configuration: .default)
    let socket = session.webSocketTask(with: url)
    lock.lock()
    self.session = session
    webSocket = socket
    lock.unlock()
    socket.resume()
    receiveScribe()
  }

  private func receiveScribe() {
    lock.lock()
    let socket = webSocket
    lock.unlock()
    socket?.receive { [weak self] result in
      guard let self else { return }
      switch result {
      case .failure:
        return
      case .success(let message):
        if case .string(let text) = message,
           let data = text.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
          let type = json["message_type"] as? String
          if type == "partial_transcript" || type == "committed_transcript",
             let caption = json["text"] as? String {
            Task { await self.publish(caption) }
          }
        }
        self.receiveScribe()
      }
    }
  }

  private func sendScribeChunk(_ buffer: AVAudioPCMBuffer) {
    guard let pcm = convertDown(buffer) else { return }
    lock.lock()
    pcmAccum.append(pcm)
    let bytesPerChunk = chunkSamples * MemoryLayout<Int16>.size
    let ready = pcmAccum.count >= bytesPerChunk
    let payload = ready ? Data(pcmAccum.prefix(bytesPerChunk)) : nil
    if ready {
      pcmAccum.removeFirst(bytesPerChunk)
    }
    let socket = webSocket
    lock.unlock()
    guard let payload, let socket else { return }
    let base64 = payload.base64EncodedString()
    let body: [String: Any] = [
      "message_type": "input_audio_chunk",
      "audio_base_64": base64,
      "commit": false,
      "sample_rate": Int(sampleRate),
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: body),
          let text = String(data: data, encoding: .utf8)
    else {
      return
    }
    socket.send(.string(text)) { _ in }
  }

  private func convertDown(_ buffer: AVAudioPCMBuffer) -> Data? {
    guard let targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: sampleRate,
      channels: 1,
      interleaved: true
    ) else {
      return nil
    }
    if downFormat != buffer.format {
      downFormat = buffer.format
      downConverter = AVAudioConverter(from: buffer.format, to: targetFormat)
    }
    guard let downConverter else { return nil }
    let ratio = buffer.format.sampleRate / sampleRate
    let frameCapacity = AVAudioFrameCount(max(1, Double(buffer.frameLength) / ratio))
    guard let converted = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity) else {
      return nil
    }
    var error: NSError?
    var consumed = false
    downConverter.convert(to: converted, error: &error) { _, outStatus in
      if consumed {
        outStatus.pointee = .noDataNow
        return nil
      }
      consumed = true
      outStatus.pointee = .haveData
      return buffer
    }
    guard error == nil, converted.frameLength > 0, let channel = converted.int16ChannelData?[0] else {
      return nil
    }
    return Data(bytes: channel, count: Int(converted.frameLength) * MemoryLayout<Int16>.size)
  }

  private func publish(_ text: String) async {
    lock.lock()
    let changed = text != lastCaption
    if changed {
      lastCaption = text
    }
    let view = view
    lock.unlock()
    guard changed, let view else { return }
    await view.updateCaptionsOverlay(text)
  }
}
