@preconcurrency import AVFoundation
import Foundation
import HaishinKit

enum AudioIsolationMode: String {
  case off
  case native
  case better
}

private let isolationSampleRate: Double = 16_000
private let isolationChunkSamples = 8192
private let isolationChunkBytes = isolationChunkSamples * MemoryLayout<Int16>.size
private let micTrack: UInt8 = 0
private let isolationTrack: UInt8 = 1

/// Hosted ElevenLabs isolation: mutes the raw mic track and injects cleaned PCM.
final class AudioIsolationProcessor: @unchecked Sendable {
  private let lock = NSLock()
  private var enabled = false
  private var endpoint: URL?
  private var authCookie: String?
  private weak var mixer: MediaMixer?
  private var downConverter: AVAudioConverter?
  private var upConverter: AVAudioConverter?
  private var downFormat: AVAudioFormat?
  private var upFormat: AVAudioFormat?
  private var pcmAccum = Data()
  private var inFlight = false
  private var pendingWhen = AVAudioTime(sampleTime: 0, atRate: isolationSampleRate)

  func configure(
    mixer: MediaMixer?,
    enabled: Bool,
    endpoint: URL?,
    authCookie: String?
  ) async {
    lock.lock()
    self.mixer = mixer
    self.enabled = enabled
    self.endpoint = endpoint
    self.authCookie = authCookie?.isEmpty == true ? nil : authCookie
    pcmAccum.removeAll(keepingCapacity: true)
    inFlight = false
    downConverter = nil
    upConverter = nil
    downFormat = nil
    upFormat = nil
    lock.unlock()

    guard let mixer else { return }
    var settings = await mixer.audioMixerSettings
    var micTrackSettings = settings.tracks[micTrack] ?? .default
    micTrackSettings.isMuted = enabled
    settings.tracks[micTrack] = micTrackSettings
    if enabled {
      settings.tracks[isolationTrack] = .init(volume: 1, isMuted: false)
    } else {
      settings.tracks.removeValue(forKey: isolationTrack)
    }
    await mixer.setAudioMixerSettings(settings)
  }

  func handleInput(track: UInt8, buffer: AVAudioPCMBuffer, when: AVAudioTime) {
    lock.lock()
    let active = enabled
    let endpoint = endpoint
    let authCookie = authCookie
    let mixer = mixer
    lock.unlock()

    guard active, track == micTrack, let endpoint, let mixer else { return }
    guard let chunk = convertDown(buffer) else { return }

    lock.lock()
    if pcmAccum.isEmpty {
      pendingWhen = when
    }
    pcmAccum.append(chunk)
    let shouldSend = pcmAccum.count >= isolationChunkBytes && !inFlight
    if shouldSend {
      inFlight = true
    }
    let payload = shouldSend ? pcmAccum.prefix(isolationChunkBytes) : nil
    if shouldSend {
      pcmAccum.removeFirst(isolationChunkBytes)
    }
    let sendWhen = pendingWhen
    lock.unlock()

    guard let payload else { return }
    let body = Data(payload)
    Task {
      defer {
        self.lock.lock()
        self.inFlight = false
        self.lock.unlock()
      }
      guard let isolated = await self.requestIsolation(
        body,
        endpoint: endpoint,
        authCookie: authCookie
      ) else {
        return
      }
      guard let output = self.convertUp(isolated, when: sendWhen) else {
        return
      }
      await mixer.append(output, when: sendWhen, track: isolationTrack)
    }
  }

  private func convertDown(_ buffer: AVAudioPCMBuffer) -> Data? {
    let targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: isolationSampleRate,
      channels: 1,
      interleaved: true
    )
    guard let targetFormat else { return nil }

    if downFormat != buffer.format {
      downFormat = buffer.format
      downConverter = AVAudioConverter(from: buffer.format, to: targetFormat)
    }
    guard let downConverter else { return nil }

    let ratio = buffer.format.sampleRate / isolationSampleRate
    let frameCapacity = AVAudioFrameCount(max(1, Double(buffer.frameLength) / ratio))
    guard let converted = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCapacity) else {
      return nil
    }

    var error: NSError?
    let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
      outStatus.pointee = .haveData
      return buffer
    }
    downConverter.convert(to: converted, error: &error, withInputFrom: inputBlock)
    guard error == nil, converted.frameLength > 0, let channel = converted.int16ChannelData?[0] else {
      return nil
    }
    let byteCount = Int(converted.frameLength) * MemoryLayout<Int16>.size
    return Data(bytes: channel, count: byteCount)
  }

  private func convertUp(_ data: Data, when: AVAudioTime) -> AVAudioPCMBuffer? {
    guard let sourceFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16,
      sampleRate: isolationSampleRate,
      channels: 1,
      interleaved: true
    ) else {
      return nil
    }
    let sampleCount = data.count / MemoryLayout<Int16>.size
    guard sampleCount > 0 else { return nil }
    guard let sourceBuffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: AVAudioFrameCount(sampleCount)) else {
      return nil
    }
    sourceBuffer.frameLength = AVAudioFrameCount(sampleCount)
    data.withUnsafeBytes { raw in
      guard let base = raw.baseAddress, let dest = sourceBuffer.int16ChannelData?[0] else {
        return
      }
      memcpy(dest, base, data.count)
    }

    if upFormat == nil {
      upFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: 48_000,
        channels: 1,
        interleaved: true
      )
    }
    guard let outputFormat = upFormat else { return nil }
    if upConverter == nil || upConverter?.outputFormat != outputFormat {
      upConverter = AVAudioConverter(from: sourceFormat, to: outputFormat)
    }
    guard let upConverter else { return nil }

    let ratio = outputFormat.sampleRate / isolationSampleRate
    let frameCapacity = AVAudioFrameCount(max(1, Double(sampleCount) * ratio))
    guard let converted = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: frameCapacity) else {
      return nil
    }

    var error: NSError?
    let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
      outStatus.pointee = .haveData
      return sourceBuffer
    }
    upConverter.convert(to: converted, error: &error, withInputFrom: inputBlock)
    guard error == nil, converted.frameLength > 0 else { return nil }
    return converted
  }

  private func requestIsolation(
    _ body: Data,
    endpoint: URL,
    authCookie: String?
  ) async -> Data? {
    var request = URLRequest(url: endpoint, timeoutInterval: 8)
    request.httpMethod = "POST"
    request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
    if let authCookie {
      request.setValue(authCookie, forHTTPHeaderField: "Cookie")
    }
    request.httpBody = body

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
        return nil
      }
      return data
    } catch {
      return nil
    }
  }
}
