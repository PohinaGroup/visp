package com.visp.mobile.srt

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.graphics.drawable.BitmapDrawable
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.AudioDeviceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaCodecList
import android.media.MediaFormat
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.style.DynamicDrawableSpan
import android.text.style.ImageSpan
import android.util.Size
import android.util.LruCache
import android.view.SurfaceView
import android.view.ViewGroup.LayoutParams
import com.pedro.common.AudioCodec
import com.pedro.common.ConnectChecker
import com.pedro.common.VideoCodec
import com.pedro.encoder.utils.CodecUtil
import com.pedro.encoder.input.audio.CustomAudioEffect
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.video.Camera2Source
import com.pedro.encoder.input.gl.render.filters.NoFilterRender
import com.pedro.encoder.input.gl.render.filters.`object`.ImageObjectFilterRender
import com.pedro.encoder.utils.gl.TranslateTo
import com.pedro.library.base.StreamBase
import com.pedro.library.srt.SrtStream
import com.pedro.library.udp.UdpStream
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.lang.ref.WeakReference
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.abs
import kotlin.math.round

/**
 * Peak mic amplitude on the encoder audio thread (0-100), without Pedro's AmplitudeEffect
 * worker that crashes on stop via uncaught InterruptedException from queue.take().
 * Optionally forwards PCM to live captions (Scribe / on-device).
 */
private class PeakAmplitudeEffect(
  private val onAmplitude: (Float) -> Unit,
  private val onPcm: ((ByteArray) -> Unit)? = null,
) : CustomAudioEffect() {
  @Volatile private var running = true

  override fun process(pcmBuffer: ByteArray): ByteArray {
    if (!running || pcmBuffer.size < 2) return pcmBuffer
    var peak = 0
    var i = 0
    while (i + 1 < pcmBuffer.size) {
      val sample =
        ((pcmBuffer[i + 1].toInt() shl 8) or (pcmBuffer[i].toInt() and 0xFF)).toShort().toInt()
      val sampleAmplitude = abs(sample)
      if (sampleAmplitude > peak) peak = sampleAmplitude
      i += 2
    }
    onAmplitude((peak / Short.MAX_VALUE.toFloat()) * 100f)
    onPcm?.invoke(pcmBuffer)
    return pcmBuffer
  }

  fun start() {
    running = true
  }

  fun stop() {
    running = false
  }
}

class VispSrt : Module() {
  private var currentView: WeakReference<VispSrtView>? = null

  override fun definition() = ModuleDefinition {
    Name("VispSrt")

    AsyncFunction("audioOutputs") {
      val context = appContext.reactContext ?: throw DeviceUnavailableException()
      audioOutputs(context).map { device ->
        mapOf("id" to device.id.toString(), "name" to device.productName.toString())
      }
    }

    AsyncFunction("playAudioFile") {
        uri: String,
        outputDeviceId: String,
        promise: Promise,
      ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("audio-unavailable", "Audio playback is unavailable", null)
        return@AsyncFunction
      }
      playAudioFile(context, uri, outputDeviceId, promise)
    }

    AsyncFunction("speakToDevice") {
        text: String,
        language: String,
        outputDeviceId: String,
        promise: Promise,
      ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("audio-unavailable", "Text to speech is unavailable", null)
        return@AsyncFunction
      }
      synthesizeToDevice(context, text, language, outputDeviceId, promise)
    }

    View(VispSrtView::class) {
      Events("onStateChange", "onAudioLevel", "onStats")

      AsyncFunction("configure") {
          view: VispSrtView,
          cameraId: String,
          width: Int,
          height: Int,
          fps: Int,
          maxVideoBitrateKbps: Int,
          bondingMode: String?,
          promise: Promise,
        ->
        remember(view)
        view.configure(
          cameraId,
          width,
          height,
          fps,
          maxVideoBitrateKbps,
          bondingMode ?: "off",
          promise,
        )
      }

      AsyncFunction("configureAudioInput") {
          view: VispSrtView,
          audioInputId: String,
          promise: Promise,
        ->
        remember(view)
        view.configureAudioInput(audioInputId, promise)
      }

      AsyncFunction("switchCamera") {
          view: VispSrtView,
          cameraId: String,
          promise: Promise,
        ->
        remember(view)
        view.switchCamera(cameraId, promise)
      }

      AsyncFunction("setZoom") { view: VispSrtView, level: Float, promise: Promise ->
        remember(view)
        view.setZoom(level, promise)
      }

      AsyncFunction("setImageStabilization") {
          view: VispSrtView,
          enabled: Boolean,
          promise: Promise,
        ->
        remember(view)
        view.setImageStabilization(enabled, promise)
      }

      AsyncFunction("setVideoBitrate") {
          view: VispSrtView,
          bitrateKbps: Int,
          promise: Promise,
        ->
        remember(view)
        view.setVideoBitrate(bitrateKbps, promise)
      }

      AsyncFunction("getCapabilities") { view: VispSrtView ->
        view.capabilities()
      }

      AsyncFunction("prepare") { view: VispSrtView, promise: Promise ->
        remember(view)
        view.prepare(promise)
      }

      AsyncFunction("updateChatOverlay") {
          view: VispSrtView,
          messages: List<Map<String, Any?>>,
          corner: String,
          promise: Promise,
        ->
        remember(view)
        view.updateChatOverlay(messages, corner, promise)
      }

      AsyncFunction("clearChatOverlay") { view: VispSrtView, promise: Promise ->
        remember(view)
        view.clearChatOverlay(promise)
      }

      AsyncFunction("updateCaptionsOverlay") {
          view: VispSrtView,
          text: String,
          promise: Promise,
        ->
        remember(view)
        view.updateCaptionsOverlay(text, promise)
      }

      AsyncFunction("clearCaptionsOverlay") { view: VispSrtView, promise: Promise ->
        remember(view)
        view.clearCaptionsOverlay(promise)
      }

      AsyncFunction("startLiveCaptions") {
          view: VispSrtView,
          language: String,
          better: Boolean,
          wsUrl: String?,
          promise: Promise,
        ->
        remember(view)
        view.startLiveCaptions(language, better, wsUrl, promise)
      }

      AsyncFunction("stopLiveCaptions") { view: VispSrtView, promise: Promise ->
        remember(view)
        view.stopLiveCaptions(promise)
      }

      AsyncFunction("start") { view: VispSrtView, url: String, promise: Promise ->
        remember(view)
        view.start(url, promise)
      }

      AsyncFunction("stop") { view: VispSrtView, promise: Promise ->
        remember(view)
        view.stop(promise)
      }

      OnViewDestroys { view: VispSrtView ->
        view.cleanup()
        if (currentView?.get() === view) currentView = null
      }
    }

    OnActivityEntersBackground {
      currentView?.get()?.cleanup()
    }

    OnActivityDestroys {
      currentView?.get()?.cleanup()
      currentView = null
    }

    OnDestroy {
      currentView?.get()?.cleanup()
      currentView = null
    }
  }

  private fun remember(view: VispSrtView) {
    currentView = WeakReference(view)
  }

  private fun audioOutputs(context: Context): List<AudioDeviceInfo> {
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      .filter { it.type in OUTPUT_DEVICE_TYPES }
  }

  private fun playAudioFile(
    context: Context,
    uri: String,
    outputDeviceId: String,
    promise: Promise,
    onFinished: (() -> Unit)? = null,
  ) {
    val device = audioOutputs(context).firstOrNull { it.id.toString() == outputDeviceId }
    if (device == null || Build.VERSION.SDK_INT < 28) {
      onFinished?.invoke()
      promise.reject("audio-output-unavailable", "The selected audio output is unavailable", null)
      return
    }
    val player = MediaPlayer()
    var settled = false
    fun finish(error: Throwable? = null) {
      if (settled) return
      settled = true
      player.release()
      onFinished?.invoke()
      if (error == null) promise.resolve()
      else promise.reject("audio-playback-failed", "Audio playback failed", error)
    }
    try {
      player.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build(),
      )
      player.setDataSource(context, Uri.parse(uri))
      if (!player.setPreferredDevice(device)) {
        finish(IllegalStateException("The selected audio output could not be routed"))
        return
      }
      player.setOnCompletionListener { finish() }
      player.setOnErrorListener { _, what, extra ->
        finish(IllegalStateException("MediaPlayer error $what/$extra"))
        true
      }
      player.setOnPreparedListener { it.start() }
      player.prepareAsync()
    } catch (error: Throwable) {
      finish(error)
    }
  }

  private fun synthesizeToDevice(
    context: Context,
    text: String,
    language: String,
    outputDeviceId: String,
    promise: Promise,
  ) {
    val file = File.createTempFile("visp-tts-", ".wav", context.cacheDir)
    val utteranceId = UUID.randomUUID().toString()
    lateinit var tts: TextToSpeech
    var settled = false
    fun fail(message: String, error: Throwable? = null) {
      if (settled) return
      settled = true
      tts.shutdown()
      file.delete()
      promise.reject("tts-failed", message, error)
    }
    tts = TextToSpeech(context) { status ->
      if (status != TextToSpeech.SUCCESS) {
        fail("Text to speech could not be initialized")
        return@TextToSpeech
      }
      val languageStatus = tts.setLanguage(Locale.forLanguageTag(language))
      if (
        languageStatus == TextToSpeech.LANG_MISSING_DATA ||
        languageStatus == TextToSpeech.LANG_NOT_SUPPORTED
      ) {
        fail("The selected language is unavailable")
        return@TextToSpeech
      }
      tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(id: String?) = Unit

        override fun onDone(id: String?) {
          if (id != utteranceId || settled) return
          settled = true
          tts.shutdown()
          playAudioFile(
            context,
            Uri.fromFile(file).toString(),
            outputDeviceId,
            promise,
          ) { file.delete() }
        }

        @Deprecated("Deprecated in Java")
        override fun onError(id: String?) {
          if (id == utteranceId) fail("Text to speech synthesis failed")
        }

        override fun onError(id: String?, errorCode: Int) {
          if (id == utteranceId) fail("Text to speech synthesis failed")
        }
      })
      if (
        tts.synthesizeToFile(text, Bundle(), file, utteranceId) !=
          TextToSpeech.SUCCESS
      ) {
        fail("Text to speech synthesis could not be queued")
      }
    }
  }

  companion object {
    private val OUTPUT_DEVICE_TYPES = setOf(
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_USB_ACCESSORY,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLE_SPEAKER,
      AudioDeviceInfo.TYPE_HEARING_AID,
    )
  }
}

private enum class StreamState(val value: String) {
  IDLE("idle"),
  PREPARING("preparing"),
  CONNECTING("connecting"),
  LIVE("live"),
  RECONNECTING("reconnecting"),
  STOPPING("stopping"),
  ERROR("error"),
}

private class DeviceUnavailableException : IllegalStateException()

private data class VideoConfiguration(
  val cameraId: String,
  val width: Int,
  val height: Int,
  val fps: Int,
)

private data class FormatCapability(
  val width: Int,
  val height: Int,
  val fps: List<Int>,
  val stabilizationFps: List<Int>,
)

private data class CameraCapability(
  val id: String,
  val name: String,
  val formats: List<FormatCapability>,
  val zoomLevels: List<Float>,
)

class VispSrtView(context: Context, appContext: AppContext) :
  ExpoView(context, appContext), ConnectChecker {
  private val onStateChange by EventDispatcher()
  private val onAudioLevel by EventDispatcher()
  private val onStats by EventDispatcher()
  private val preview = SurfaceView(context).also {
    addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  @Volatile private var intentionalStop = true
  @Volatile private var state = StreamState.IDLE
  private var audioInputId: Int? = null
  private var bondingMode = "off"
  private var configuration: VideoConfiguration? = null
  private var imageStabilizationEnabled = true
  private var lastPacketsLost = 0
  private var lastBytesSent = 0L
  private var lastLinkDegraded: Boolean? = null
  private var measuredBitrateBps = 0L
  private var preparedPortrait: Boolean? = null
  private var reconfigurePosted = false
  private var retryAttempt = 0
  private var selectedZoom = 1f
  private var statsRunnable: Runnable? = null
  private var targetBitrateBps = VIDEO_BITRATE
  private var videoBitrateCeilingBps = VIDEO_BITRATE
  private var stream: StreamBase? = null
  private val transportExecutor = Executors.newSingleThreadExecutor()
  private val chatExecutor = Executors.newSingleThreadExecutor()
  private val chatGeneration = AtomicInteger()
  private val chatImageCache = object : LruCache<String, Bitmap>(8 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
  }
  private var chatBitmap: Bitmap? = null
  private var chatCorner = "bottom-left"
  private var captionsBitmap: Bitmap? = null
  private var overlayFilter: ImageObjectFilterRender? = null
  private var amplitudeEffect: PeakAmplitudeEffect? = null
  private var lastAudioLevelAt = 0L
  private val liveCaptions =
    LiveCaptionsController(context) { text ->
      applyCaptionsText(text)
    }

  fun prepare(promise: Promise) {
    if (stream != null) {
      promise.resolve(false)
      return
    }

    val requestedPermissions =
      appContext.permissions?.hasGrantedPermissions(*REQUIRED_PERMISSIONS) != true
    emit(StreamState.PREPARING)
    withPermissions(
      onGranted = {
        try {
          configure(isPortrait())
          promise.resolve(requestedPermissions)
        } catch (error: DeviceUnavailableException) {
          fail("device-unavailable", CAMERA_UNAVAILABLE, promise, error)
        } catch (error: Throwable) {
          fail("capture-failed", CAMERA_UNAVAILABLE, promise, error)
        }
      },
      onDenied = {
        fail("permission-denied", PERMISSION_DENIED, promise)
      },
    )
  }

  fun start(value: String, promise: Promise) {
    val url = try {
      validatedUrl(value)
    } catch (error: Throwable) {
      fail("invalid-url", INVALID_URL, promise, error)
      return
    }

    fun startPrepared() {
      try {
        val current = stream ?: configure(isPortrait())
        if (current.isStreaming) {
          promise.resolve()
          return
        }

        intentionalStop = false
        retryAttempt = 0
        current.getGlInterface().autoHandleOrientation = false
        emit(StreamState.CONNECTING)
        if (bondingMode == "off") {
          current.startStream(url)
          promise.resolve()
        } else {
          transportExecutor.execute {
            val port = runCatching {
              BondedSrtNative.start(context, url, bondingMode)
            }.getOrElse {
              post {
                intentionalStop = true
                fail("connection-failed", CONNECTION_FAILED, promise, it)
              }
              return@execute
            }
            post {
              if (intentionalStop) {
                BondedSrtNative.stop(context)
                promise.resolve()
              } else {
                current.startStream("udp://127.0.0.1:$port")
                promise.resolve()
              }
            }
          }
        }
      } catch (error: Throwable) {
        intentionalStop = true
        fail("connection-failed", CONNECTION_FAILED, promise, error)
      }
    }

    if (stream != null) {
      startPrepared()
      return
    }

    emit(StreamState.PREPARING)
    withPermissions(
      onGranted = {
        try {
          configure(isPortrait())
          startPrepared()
        } catch (error: DeviceUnavailableException) {
          fail("device-unavailable", CAMERA_UNAVAILABLE, promise, error)
        } catch (error: Throwable) {
          fail("capture-failed", CAMERA_UNAVAILABLE, promise, error)
        }
      },
      onDenied = {
        fail("permission-denied", PERMISSION_DENIED, promise)
      },
    )
  }

  fun capabilities(): Map<String, Any> {
    val cameras = cameraCapabilities()
    val selected = resolvedConfiguration(cameras)
    val audioInputs = audioInputs()
    if (audioInputId != null && audioInputs.none { it.id == audioInputId }) {
      audioInputId = null
    }
    configuration = selected
    return mapOf(
      "audioInputs" to audioInputs.map { input ->
        mapOf(
          "id" to input.id.toString(),
          "name" to input.productName.toString().ifBlank { "Microphone" },
        )
      },
      "cameras" to cameras.map { camera ->
        mapOf(
          "id" to camera.id,
          "name" to camera.name,
          "zoomLevels" to camera.zoomLevels,
          "formats" to camera.formats.map { format ->
            mapOf(
              "fps" to format.fps,
              "height" to format.height,
              "stabilizationFps" to format.stabilizationFps,
              "width" to format.width,
            )
          },
        )
      },
      "selectedAudioInputId" to (audioInputId?.toString() ?: DEFAULT_AUDIO_INPUT_ID),
      "selectedZoom" to selectedZoom,
      "selected" to selected.toMap(),
    )
  }

  fun updateChatOverlay(
    messages: List<Map<String, Any?>>,
    corner: String,
    promise: Promise,
  ) {
    val generation = chatGeneration.incrementAndGet()
    chatExecutor.execute {
      try {
        val images = mutableMapOf<String, Bitmap>()
        messages.takeLast(4).forEach { message ->
          (fragments(message) + badges(message)).forEach { item ->
            val url = item["url"] as? String ?: return@forEach
            loadChatImage(url)?.let { images[url] = it }
          }
        }
        val bitmap = renderChatOverlay(messages.takeLast(4), images)
        post {
          if (generation == chatGeneration.get()) {
            chatBitmap = bitmap
            chatCorner = corner.takeIf(::validChatCorner) ?: "bottom-left"
            applyOverlays()
          }
          promise.resolve()
        }
      } catch (_: Throwable) {
        post { promise.resolve() }
      }
    }
  }

  fun clearChatOverlay(promise: Promise) {
    chatGeneration.incrementAndGet()
    chatBitmap = null
    applyOverlays()
    promise.resolve()
  }

  fun updateCaptionsOverlay(text: String, promise: Promise) {
    chatExecutor.execute {
      try {
        applyCaptionsText(text)
        post { promise.resolve() }
      } catch (_: Throwable) {
        post { promise.resolve() }
      }
    }
  }

  fun clearCaptionsOverlay(promise: Promise) {
    captionsBitmap = null
    applyOverlays()
    promise.resolve()
  }

  private fun applyCaptionsText(text: String) {
    val trimmed = text.trim()
    val bitmap = if (trimmed.isEmpty()) null else renderCaptionsOverlay(trimmed)
    post {
      captionsBitmap = bitmap
      applyOverlays()
    }
  }

  fun startLiveCaptions(
    language: String,
    better: Boolean,
    wsUrl: String?,
    promise: Promise,
  ) {
    liveCaptions.start(language, better, wsUrl)
    promise.resolve(true)
  }

  fun stopLiveCaptions(promise: Promise) {
    liveCaptions.stop()
    promise.resolve()
  }

  fun configure(
    cameraId: String,
    width: Int,
    height: Int,
    fps: Int,
    maxVideoBitrateKbps: Int,
    bondingMode: String,
    promise: Promise,
  ) {
    if (state != StreamState.IDLE && state != StreamState.ERROR) {
      fail("configuration-unavailable", CONFIGURATION_UNAVAILABLE, promise)
      return
    }
    withPermissions(
      onGranted = {
        try {
          val cameras = cameraCapabilities()
          val camera = cameras.firstOrNull { it.id == cameraId } ?: throw IllegalArgumentException()
          val format = camera.formats.firstOrNull { it.width == width && it.height == height }
            ?: throw IllegalArgumentException()
          if (fps !in format.fps) throw IllegalArgumentException()
          val nextConfiguration = VideoConfiguration(cameraId, width, height, fps)
          val nextVideoBitrateCeilingBps = maxOf(500, maxVideoBitrateKbps) * 1_000
          val nextBondingMode = bondingMode.takeIf { it == "broadcast" || it == "backup" } ?: "off"
          if (
            stream != null &&
            configuration == nextConfiguration &&
            videoBitrateCeilingBps == nextVideoBitrateCeilingBps
          ) {
            this.bondingMode = nextBondingMode
            promise.resolve()
            return@withPermissions
          }
          if (configuration?.cameraId != cameraId) selectedZoom = defaultZoom(camera.zoomLevels)
          configuration = nextConfiguration
          videoBitrateCeilingBps = nextVideoBitrateCeilingBps
          targetBitrateBps = videoBitrateCeilingBps
          this.bondingMode = nextBondingMode
          configure(isPortrait(), clearPreview = false)
          promise.resolve()
        } catch (error: Throwable) {
          fail("configuration-unavailable", CONFIGURATION_UNAVAILABLE, promise, error)
        }
      },
      onDenied = { fail("permission-denied", PERMISSION_DENIED, promise) },
    )
  }

  fun configureAudioInput(inputId: String, promise: Promise) {
    if (state != StreamState.IDLE && state != StreamState.ERROR) {
      fail("configuration-unavailable", CONFIGURATION_UNAVAILABLE, promise)
      return
    }
    withPermissions(
      onGranted = {
        try {
          audioInputId = if (inputId == DEFAULT_AUDIO_INPUT_ID) {
            null
          } else {
            val id = inputId.toIntOrNull() ?: throw IllegalArgumentException()
            audioInputs().firstOrNull { it.id == id }?.id ?: throw IllegalArgumentException()
          }
          configure(isPortrait(), clearPreview = false)
          promise.resolve()
        } catch (error: Throwable) {
          fail("audio-input-unavailable", AUDIO_INPUT_UNAVAILABLE, promise, error)
        }
      },
      onDenied = { fail("permission-denied", PERMISSION_DENIED, promise) },
    )
  }

  fun switchCamera(cameraId: String, promise: Promise) {
    val current = configuration
    val currentStream = stream
    if (
      current == null ||
      currentStream == null ||
      state == StreamState.STOPPING ||
      state == StreamState.ERROR
    ) {
      promise.reject("configuration-unavailable", CONFIGURATION_UNAVAILABLE, null)
      return
    }
    if (cameraId == current.cameraId) {
      promise.resolve()
      return
    }
    val camera = cameraCapabilities().firstOrNull { it.id == cameraId }
    if (camera == null) {
      promise.reject("configuration-unavailable", CONFIGURATION_UNAVAILABLE, null)
      return
    }
    val supported = camera.formats.any {
        it.width == current.width &&
          it.height == current.height &&
          current.fps in it.fps
      }
    if (!supported) {
      promise.reject("configuration-unavailable", CONFIGURATION_UNAVAILABLE, null)
      return
    }
    try {
      (currentStream.videoSource as Camera2Source).switchCamera()
      configuration = current.copy(cameraId = cameraId)
      selectedZoom = defaultZoom(camera.zoomLevels)
      applyImageStabilization(currentStream.videoSource as Camera2Source, imageStabilizationEnabled)
      promise.resolve()
    } catch (error: Throwable) {
      promise.reject("configuration-unavailable", CONFIGURATION_UNAVAILABLE, error)
    }
  }

  fun setZoom(level: Float, promise: Promise) {
    val source = stream?.videoSource as? Camera2Source
    val camera = cameraCapabilities().firstOrNull { it.id == configuration?.cameraId }
    val supported = camera?.zoomLevels?.firstOrNull { abs(it - level) < 0.051f }
    if (
      source == null ||
      supported == null ||
      !level.isFinite() ||
      state == StreamState.PREPARING ||
      state == StreamState.STOPPING
    ) {
      promise.reject("configuration-unavailable", CONFIGURATION_UNAVAILABLE, null)
      return
    }
    try {
      source.setZoom(supported)
      selectedZoom = supported
      promise.resolve()
    } catch (error: Throwable) {
      promise.reject("configuration-unavailable", CONFIGURATION_UNAVAILABLE, error)
    }
  }

  fun setImageStabilization(enabled: Boolean, promise: Promise) {
    val source = stream?.videoSource as? Camera2Source
    if (source == null) {
      imageStabilizationEnabled = enabled
      promise.resolve()
      return
    }
    if (enabled && !supportsImageStabilization(configuration)) {
      promise.reject("stabilization-unavailable", STABILIZATION_UNAVAILABLE, null)
      return
    }
    val previous = imageStabilizationEnabled
    try {
      if (!applyImageStabilization(source, enabled)) {
        applyImageStabilization(source, previous)
        promise.reject("stabilization-unavailable", STABILIZATION_UNAVAILABLE, null)
        return
      }
      imageStabilizationEnabled = enabled
      promise.resolve()
    } catch (error: Throwable) {
      applyImageStabilization(source, previous)
      promise.reject("stabilization-unavailable", STABILIZATION_UNAVAILABLE, error)
    }
  }

  fun setVideoBitrate(bitrateKbps: Int, promise: Promise) {
    val current = stream
    if (current == null) {
      promise.reject("configuration-unavailable", CONFIGURATION_UNAVAILABLE, null)
      return
    }
    targetBitrateBps = (bitrateKbps * 1_000).coerceIn(500_000, videoBitrateCeilingBps)
    current.setVideoBitrateOnFly(targetBitrateBps)
    promise.resolve()
  }

  fun stop(promise: Promise) {
    intentionalStop = true
    retryAttempt = 0
    stopStatsLoop()
    val current = stream
    try {
      if (current?.isStreaming == true) {
        emit(StreamState.STOPPING)
        // Keep camera preview alive (iOS parity). cleanup() is for teardown only.
        val encodersReady = current.stopStream()
        if (!encodersReady) {
          configure(isPortrait())
        }
      }
      if (bondingMode != "off") BondedSrtNative.stop(context)
      keepScreenOn = false
      emit(StreamState.IDLE)
      promise.resolve()
    } catch (error: Throwable) {
      cleanup()
      fail("capture-failed", CAMERA_UNAVAILABLE, promise, error)
    }
  }

  fun cleanup() {
    intentionalStop = true
    retryAttempt = 0
    stopStatsLoop()
    liveCaptions.stop()
    amplitudeEffect?.stop()
    amplitudeEffect = null
    stream?.let { current ->
      if (current.isOnPreview) current.stopPreview(true)
      current.release()
    }
    if (bondingMode != "off") BondedSrtNative.stop(context)
    stream = null
    overlayFilter = null
    preparedPortrait = null
    keepScreenOn = false
    state = StreamState.IDLE
  }

  override fun onDetachedFromWindow() {
    cleanup()
    super.onDetachedFromWindow()
  }

  override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
    super.onSizeChanged(width, height, oldWidth, oldHeight)
    val portrait = height >= width
    if (
      width <= 0 ||
      height <= 0 ||
      stream == null ||
      state != StreamState.IDLE ||
      portrait == preparedPortrait ||
      reconfigurePosted
    ) return

    reconfigurePosted = true
    post {
      reconfigurePosted = false
      if (stream != null && state == StreamState.IDLE && portrait != preparedPortrait) {
        try {
          configure(portrait)
        } catch (_: Throwable) {
          emit(StreamState.ERROR, code = "capture-failed", message = CAMERA_UNAVAILABLE)
        }
      }
    }
  }

  override fun onConnectionStarted(url: String) = Unit

  override fun onConnectionSuccess() {
    post {
      if (!intentionalStop) {
        retryAttempt = 0
        keepScreenOn = true
        targetBitrateBps = videoBitrateCeilingBps
        lastPacketsLost = (stream as? SrtStream)?.getStreamClient()?.getPacketsLost() ?: 0
        lastBytesSent = stream?.getStreamClient()?.getBytesSend() ?: 0L
        lastLinkDegraded = null
        startStatsLoop()
        emit(StreamState.LIVE)
      }
    }
  }

  @Synchronized
  override fun onConnectionFailed(reason: String) {
    if (intentionalStop) return
    val current = stream ?: return
    val delay = RETRY_DELAYS.getOrNull(retryAttempt)

    if (
      current is SrtStream &&
      delay != null &&
      current.getStreamClient().reTry(delay, reason, null)
    ) {
      val attempt = ++retryAttempt
      post {
        if (!intentionalStop) {
          keepScreenOn = false
          stopStatsLoop()
          emit(StreamState.RECONNECTING, attempt = attempt)
        }
      }
      return
    }

    intentionalStop = true
    post {
      if (current.isStreaming) current.stopStream()
      keepScreenOn = false
      stopStatsLoop()
      emit(StreamState.ERROR, code = "connection-failed", message = CONNECTION_FAILED)
    }
  }

  override fun onNewBitrate(bitrate: Long) {
    measuredBitrateBps = bitrate
  }

  override fun onDisconnect() = Unit

  override fun onAuthError() {
    intentionalStop = true
    post {
      stream?.let { if (it.isStreaming) it.stopStream() }
      keepScreenOn = false
      emit(StreamState.ERROR, code = "connection-failed", message = CONNECTION_FAILED)
    }
  }

  override fun onAuthSuccess() = Unit

  private fun configure(portrait: Boolean, clearPreview: Boolean = true): StreamBase {
    if (
      !context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA) ||
      !context.packageManager.hasSystemFeature(PackageManager.FEATURE_MICROPHONE)
    ) {
      throw DeviceUnavailableException()
    }

    intentionalStop = true
    stream?.let { current ->
      if (current.isOnPreview) current.stopPreview(clearPreview)
      current.release()
    }
    stream = null
    overlayFilter = null
    preparedPortrait = null

    emit(StreamState.PREPARING)
    val cameras = cameraCapabilities()
    val selected = resolvedConfiguration(cameras)
    configuration = selected
    targetBitrateBps = videoBitrateCeilingBps
    val zoomLevels = cameras.first { it.id == selected.cameraId }.zoomLevels
    selectedZoom = zoomLevels.firstOrNull { abs(it - selectedZoom) < 0.051f }
      ?: defaultZoom(zoomLevels)
    val cameraSource = Camera2Source(context).apply {
      if (selected.cameraId == "front") switchCamera()
    }
    val microphoneSource = MicrophoneSource()
    amplitudeEffect?.stop()
    // Peak amplitude 0-100 per PCM buffer on the audio thread (no interruptible worker).
    val effect =
      PeakAmplitudeEffect(
        onAmplitude = { amplitude ->
          val now = SystemClock.uptimeMillis()
          if (now - lastAudioLevelAt >= 150) {
            lastAudioLevelAt = now
            onAudioLevel(mapOf("level" to amplitude / 100f))
          }
        },
        onPcm = { buffer -> liveCaptions.onPcm(buffer) },
      )
    microphoneSource.setAudioEffect(effect)
    effect.start()
    amplitudeEffect = effect
    audioInputId?.let { selectedId ->
      val input = audioInputs().firstOrNull { it.id == selectedId }
      if (input == null) {
        audioInputId = null
      } else {
        microphoneSource.setPreferredDevice(input)
      }
    }
    val next =
      (if (bondingMode == "off") {
        SrtStream(context, this, cameraSource, microphoneSource)
      } else {
        UdpStream(context, this, cameraSource, microphoneSource)
      }).apply {
      setVideoCodec(VideoCodec.H264)
      setAudioCodec(AudioCodec.AAC)
      // Hardware H264 is widely available; hardware AAC often is not.
      forceCodecType(
        CodecUtil.CodecType.HARDWARE,
        CodecUtil.CodecType.FIRST_COMPATIBLE_FOUND,
      )
      getStreamClient().setLogs(false)
      getStreamClient().setReTries(RETRY_DELAYS.size)
      getGlInterface().autoHandleOrientation = true
    }

    val rotation = if (portrait) 90 else 0
    val videoReady = next.prepareVideo(
      selected.width,
      selected.height,
      videoBitrateCeilingBps,
      selected.fps,
      KEYFRAME_INTERVAL,
      rotation,
    )
    val audioReady = next.prepareAudio(
      AUDIO_SAMPLE_RATE,
      false,
      AUDIO_BITRATE,
      true,
      true,
    )

    if (!videoReady || !audioReady) {
      next.release()
      throw IllegalStateException(CAMERA_UNAVAILABLE)
    }

    stream = next
    preparedPortrait = portrait
    next.startPreview(preview, true)
    cameraSource.setZoom(selectedZoom)
    applyImageStabilization(cameraSource, imageStabilizationEnabled)
    applyOverlays()
    emit(StreamState.IDLE)
    return next
  }

  private fun applyOverlays() {
    val current = stream ?: return
    val chat = chatBitmap
    val captions = captionsBitmap
    if (chat == null && captions == null) {
      if (overlayFilter != null) current.getGlInterface().setFilter(NoFilterRender())
      overlayFilter = null
      return
    }
    val portrait = preparedPortrait == true
    val selected = configuration ?: return
    val frameWidth = if (portrait) selected.height else selected.width
    val frameHeight = if (portrait) selected.width else selected.height
    val composite = Bitmap.createBitmap(frameWidth, frameHeight, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(composite)
    if (chat != null) {
      val margin = (minOf(frameWidth, frameHeight) * 0.04f).toInt().coerceAtLeast(24)
      val left = if (chatCorner.endsWith("right")) frameWidth - chat.width - margin else margin
      val top = if (chatCorner.startsWith("top")) margin else frameHeight - chat.height - margin
      canvas.drawBitmap(chat, left.toFloat(), top.toFloat(), null)
    }
    if (captions != null) {
      val margin = (minOf(frameWidth, frameHeight) * 0.05f).toInt().coerceAtLeast(28)
      val left = ((frameWidth - captions.width) / 2).coerceAtLeast(margin)
      val top = frameHeight - captions.height - margin
      canvas.drawBitmap(captions, left.toFloat(), top.toFloat(), null)
    }
    val filter = overlayFilter ?: ImageObjectFilterRender().also {
      overlayFilter = it
      current.getGlInterface().setFilter(it)
    }
    filter.setImage(composite)
    filter.setDefaultScale(frameWidth, frameHeight)
    filter.setPosition(TranslateTo.CENTER)
  }

  private fun renderCaptionsOverlay(text: String): Bitmap? {
    val maxWidth = 960
    val horizontalPadding = 28f
    val verticalPadding = 16f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = 36f
      typeface = android.graphics.Typeface.create(
        android.graphics.Typeface.DEFAULT,
        android.graphics.Typeface.BOLD,
      )
    }
    val clipped = text.take(180)
    val available = maxWidth - horizontalPadding * 2
    val lines = mutableListOf<String>()
    var remaining = clipped
    while (remaining.isNotEmpty() && lines.size < 3) {
      var end = remaining.length
      while (end > 0 && paint.measureText(remaining.substring(0, end)) > available) {
        end -= 1
      }
      if (end <= 0) break
      val breakAt = remaining.lastIndexOf(' ', end - 1).takeIf { it > 0 } ?: end
      lines += remaining.substring(0, breakAt).trim()
      remaining = remaining.substring(breakAt).trimStart()
    }
    if (lines.isEmpty()) return null
    val lineHeight = paint.fontSpacing
    val textWidth = lines.maxOf { paint.measureText(it) }
    val width = (textWidth + horizontalPadding * 2).toInt().coerceAtMost(maxWidth)
    val height = (lineHeight * lines.size + verticalPadding * 2).toInt()
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(184, 0, 0, 0) }
    canvas.drawRoundRect(RectF(0f, 0f, width.toFloat(), height.toFloat()), 16f, 16f, background)
    var y = verticalPadding - paint.ascent()
    for (line in lines) {
      val x = (width - paint.measureText(line)) / 2f
      canvas.drawText(line, x, y, paint)
      y += lineHeight
    }
    return bitmap
  }

  private fun loadChatImage(value: String): Bitmap? {
    chatImageCache.get(value)?.let { return it }
    val url = runCatching { URL(value) }.getOrNull() ?: return null
    if (url.protocol != "https" || url.host !in setOf("static-cdn.jtvnw.net", "files.kick.com")) {
      return null
    }
    return runCatching {
      val connection = url.openConnection() as HttpURLConnection
      connection.connectTimeout = 5_000
      connection.readTimeout = 5_000
      connection.instanceFollowRedirects = false
      connection.connect()
      if (connection.responseCode != 200 || connection.contentLengthLong > 1_500_000) return null
      val output = ByteArrayOutputStream()
      connection.inputStream.use { input ->
        val buffer = ByteArray(8_192)
        while (true) {
          val count = input.read(buffer)
          if (count < 0) break
          if (output.size() + count > 1_500_000) return null
          output.write(buffer, 0, count)
        }
      }
      val bytes = output.toByteArray()
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
      chatImageCache.put(value, bitmap)
      bitmap
    }.getOrNull()
  }

  private fun renderChatOverlay(
    messages: List<Map<String, Any?>>,
    images: Map<String, Bitmap>,
  ): Bitmap? {
    if (messages.isEmpty()) return null
    val width = 310
    val padding = 12
    val horizontalPadding = 14
    val rowGap = 6
    val background = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(174, 0, 0, 0) }
    val senderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = 18f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = 17f }
    val rows = messages.map { message ->
      val body = SpannableStringBuilder()
      fragments(message).take(32).forEach { fragment ->
        val text = (fragment["text"] as? String ?: "").take(180)
        val image = (fragment["url"] as? String)?.let(images::get)
        if (fragment["type"] == "emote" && image != null) {
          val start = body.length
          body.append('\uFFFC')
          val drawable = BitmapDrawable(resources, image).apply { setBounds(0, 0, 30, 30) }
          body.setSpan(
            ImageSpan(drawable, DynamicDrawableSpan.ALIGN_BOTTOM),
            start,
            body.length,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
          )
          body.append('\u2009')
        } else {
          body.append(text)
        }
      }
      val bodyLayout = StaticLayout.Builder.obtain(
        body,
        0,
        body.length,
        textPaint,
        width - horizontalPadding * 2,
      )
        .setAlignment(Layout.Alignment.ALIGN_NORMAL)
        .setIncludePad(false)
        .build()
      Triple(message, bodyLayout, maxOf(28, bodyLayout.height) + 48)
    }
    val bitmapHeight = padding * 2 + rows.sumOf { it.third } + rowGap * (rows.size - 1)
    val bitmap = Bitmap.createBitmap(width, bitmapHeight, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    var y = padding
    rows.forEach { (message, bodyLayout, rowHeight) ->
      val opacity = ((message["opacity"] as? Number)?.toFloat() ?: 1f).coerceIn(0f, 1f)
      val layer = canvas.saveLayerAlpha(0f, 0f, bitmap.width.toFloat(), bitmap.height.toFloat(), (opacity * 255).toInt())
      canvas.drawRoundRect(RectF(0f, y.toFloat(), width.toFloat(), (y + rowHeight).toFloat()), 14f, 14f, background)
      val sender = message["sender"] as? Map<*, *>
      senderPaint.color = parseChatColor(sender?.get("color") as? String)
      var senderX = 14f
      val provider = message["provider"] as? String
      val providerInitial = if (provider == "twitch") "T" else if (provider == "youtube") "Y" else "K"
      val providerBackground = if (provider == "twitch") "#9146FF" else if (provider == "youtube") "#FF0000" else "#53FC18"
      val providerForeground = if (provider == "kick") "#071005" else "#FFFFFF"
      drawChatChip(
        canvas,
        providerInitial,
        senderX,
        (y + 8).toFloat(),
        Color.parseColor(providerBackground),
        Color.parseColor(providerForeground),
      )
      senderX += 24
      badges(message).take(4).forEach { badge ->
        val label = (badge["label"] as? String ?: "").take(24)
        val image = (badge["url"] as? String)?.let(images::get)
        if (image != null) {
          canvas.drawBitmap(
            image,
            null,
            RectF(senderX, (y + 8).toFloat(), senderX + 20, (y + 28).toFloat()),
            null,
          )
        } else {
          drawChatChip(
            canvas,
            label.take(3).uppercase(),
            senderX,
            (y + 8).toFloat(),
            chatBadgeColor(badge["type"] as? String),
            Color.WHITE,
          )
        }
        senderX += 24
      }
      val senderName = (sender?.get("name") as? String ?: "viewer").take(64)
      val senderCount = senderPaint.breakText(senderName, true, width - 14f - senderX, null)
      canvas.drawText(senderName.take(senderCount), senderX, (y + 25).toFloat(), senderPaint)
      canvas.save()
      canvas.translate(horizontalPadding.toFloat(), (y + 38).toFloat())
      bodyLayout.draw(canvas)
      canvas.restore()
      canvas.restoreToCount(layer)
      y += rowHeight + rowGap
    }
    return bitmap
  }

  @Suppress("UNCHECKED_CAST")
  private fun fragments(message: Map<String, Any?>): List<Map<String, Any?>> =
    message["fragments"] as? List<Map<String, Any?>> ?: emptyList()

  @Suppress("UNCHECKED_CAST")
  private fun badges(message: Map<String, Any?>): List<Map<String, Any?>> =
    (message["sender"] as? Map<String, Any?>)?.get("badges") as? List<Map<String, Any?>>
      ?: emptyList()

  private fun drawChatChip(
    canvas: Canvas,
    label: String,
    x: Float,
    y: Float,
    background: Int,
    foreground: Int,
  ) {
    val rect = RectF(x, y, x + 20, y + 20)
    canvas.drawRoundRect(
      rect,
      5f,
      5f,
      Paint(Paint.ANTI_ALIAS_FLAG).apply { color = background },
    )
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = foreground
      textAlign = Paint.Align.CENTER
      textSize = if (label.length > 1) 8f else 11f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    canvas.drawText(label, rect.centerX(), rect.centerY() - (paint.ascent() + paint.descent()) / 2, paint)
  }

  private fun chatBadgeColor(type: String?): Int = Color.parseColor(
    when (type) {
      "broadcaster" -> "#E91916"
      "moderator" -> "#00AD03"
      "vip" -> "#E005B9"
      "subscriber" -> "#6441A5"
      "founder" -> "#C79A00"
      else -> "#53606E"
    },
  )

  private fun parseChatColor(value: String?): Int =
    if (value?.matches(Regex("^#[0-9A-Fa-f]{6}$")) == true) Color.parseColor(value) else Color.WHITE

  private fun validChatCorner(value: String) =
    value in setOf("top-left", "top-right", "bottom-left", "bottom-right")

  private fun withPermissions(onGranted: () -> Unit, onDenied: () -> Unit) {
    val permissions = appContext.permissions
    if (permissions == null) {
      onDenied()
      return
    }
    if (permissions.hasGrantedPermissions(*REQUIRED_PERMISSIONS)) {
      onGranted()
      return
    }

    try {
      permissions.askForPermissions(
        PermissionsResponseListener { responses ->
          post {
            if (REQUIRED_PERMISSIONS.all { responses[it]?.status == PermissionsStatus.GRANTED }) {
              onGranted()
            } else {
              onDenied()
            }
          }
        },
        *REQUIRED_PERMISSIONS,
      )
    } catch (_: IllegalStateException) {
      onDenied()
    }
  }

  private fun cameraCapabilities(): List<CameraCapability> {
    val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    val encoder = MediaCodecList(MediaCodecList.ALL_CODECS).codecInfos
      .firstOrNull { info ->
        info.isEncoder &&
          (Build.VERSION.SDK_INT < 29 || info.isHardwareAccelerated) &&
          info.supportedTypes.any { it.equals(MediaFormat.MIMETYPE_VIDEO_AVC, true) }
      }
      ?.getCapabilitiesForType(MediaFormat.MIMETYPE_VIDEO_AVC)
      ?.videoCapabilities ?: throw DeviceUnavailableException()

    return listOf(
      "back" to CameraCharacteristics.LENS_FACING_BACK,
      "front" to CameraCharacteristics.LENS_FACING_FRONT,
    ).mapNotNull { (id, facing) ->
      val cameraId = manager.cameraIdList.firstOrNull {
        manager.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) == facing
      } ?: return@mapNotNull null
      val characteristics = manager.getCameraCharacteristics(cameraId)
      val map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        ?: return@mapNotNull null
      val ranges = characteristics.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
        ?.toList().orEmpty()
      val stabilizationSupported =
        characteristics.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES)
          ?.contains(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON) == true ||
          characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION)
            ?.contains(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON) == true
      val formats = map.getOutputSizes(SurfaceTexture::class.java).orEmpty()
        .asSequence()
        .filter { size ->
          size.width % 2 == 0 &&
            size.height % 2 == 0 &&
            maxOf(size.width, size.height) <= 3840 &&
            minOf(size.width, size.height) >= 480 &&
            encoder.isSizeSupported(size.width, size.height)
        }
        .mapNotNull { size ->
          val duration = map.getOutputMinFrameDuration(SurfaceTexture::class.java, size)
          val maxFps = if (duration > 0) 1_000_000_000.0 / duration else Double.MAX_VALUE
          val candidates = (COMMON_FRAME_RATES + ranges.flatMap { listOf(it.lower, it.upper) }).distinct()
          val fps = candidates.filter { value ->
            value <= maxFps &&
              ranges.any { value in it } &&
              encoder.areSizeAndRateSupported(size.width, size.height, value.toDouble())
          }.sorted()
          if (fps.isEmpty()) null else FormatCapability(
            size.width,
            size.height,
            fps,
            if (stabilizationSupported) fps else emptyList(),
          )
        }
        .distinctBy { it.width to it.height }
        .sortedBy { it.width * it.height }
        .toList()
      if (formats.isEmpty()) null else CameraCapability(
        id = id,
        name = if (id == "front") "Front camera" else "Rear camera",
        formats = formats,
        zoomLevels = nativeZoomLevels(manager, characteristics),
      )
    }
  }

  private fun supportsImageStabilization(configuration: VideoConfiguration?): Boolean {
    if (configuration == null) return false
    return cameraCapabilities()
      .firstOrNull { it.id == configuration.cameraId }
      ?.formats
      ?.firstOrNull {
        it.width == configuration.width && it.height == configuration.height
      }
      ?.stabilizationFps
      ?.contains(configuration.fps) == true
  }

  private fun applyImageStabilization(source: Camera2Source, enabled: Boolean): Boolean {
    source.disableVideoStabilization()
    source.disableOpticalVideoStabilization()
    if (!enabled) return true
    return source.enableVideoStabilization() || source.enableOpticalVideoStabilization()
  }

  private fun nativeZoomLevels(
    manager: CameraManager,
    characteristics: CameraCharacteristics,
  ): List<Float> {
    val range = zoomRange(characteristics)
    if (Build.VERSION.SDK_INT < 28) return listOf(1f)
    val scales = characteristics.physicalCameraIds.mapNotNull { cameraId ->
      try {
        lensScale(manager.getCameraCharacteristics(cameraId))
      } catch (_: Throwable) {
        null
      }
    }.distinct().sorted()
    if (scales.size < 2) return listOf(1f)
    val reference = scales[if (range.first < 0.99f) 1 else 0]
    return (scales.map { round(it / reference * 10f) / 10f } + 1f)
      .filter { it in (range.first - 0.01f)..(range.second + 0.01f) }
      .distinct()
      .sorted()
  }

  private fun zoomRange(characteristics: CameraCharacteristics): Pair<Float, Float> {
    if (
      Build.VERSION.SDK_INT >= 30 &&
      characteristics.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL) !=
        CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY
    ) {
      characteristics.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)?.let {
        return it.lower to it.upper
      }
    }
    return 1f to
      (characteristics.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f)
  }

  private fun lensScale(characteristics: CameraCharacteristics): Float? {
    val sensor = characteristics.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE) ?: return null
    val focalLength = characteristics.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
      ?.minOrNull() ?: return null
    return focalLength / sensor.width
  }

  private fun defaultZoom(levels: List<Float>): Float =
    levels.minByOrNull { abs(it - 1f) } ?: 1f

  private fun audioInputs(): List<AudioDeviceInfo> {
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    return manager.getDevices(AudioManager.GET_DEVICES_INPUTS).toList()
  }

  private fun resolvedConfiguration(
    cameras: List<CameraCapability> = cameraCapabilities(),
  ): VideoConfiguration {
    configuration?.let { selected ->
      val format = cameras.firstOrNull { it.id == selected.cameraId }
        ?.formats?.firstOrNull { it.width == selected.width && it.height == selected.height }
      if (format != null && selected.fps in format.fps) return selected
    }
    val camera = cameras.firstOrNull { it.id == "back" }
      ?: cameras.firstOrNull() ?: throw DeviceUnavailableException()
    val format = camera.formats.firstOrNull { it.width == 1280 && it.height == 720 }
      ?: camera.formats.firstOrNull { it.width == 1920 && it.height == 1080 }
      ?: camera.formats.first()
    return VideoConfiguration(
      cameraId = camera.id,
      width = format.width,
      height = format.height,
      fps = if (30 in format.fps) 30 else format.fps.last(),
    )
  }

  private fun validatedUrl(value: String): String {
    val trimmed = value.trim()
    val uri = Uri.parse(trimmed)
    val streamId = uri.getQueryParameter("streamid")
    require(
      uri.scheme.equals("srt", ignoreCase = true) &&
        !uri.host.isNullOrBlank() &&
        uri.port in 1..65_535 &&
        streamId?.startsWith("publish:") == true,
    )
    return if (bondingMode == "off") {
      trimmed
    } else {
      uri.buildUpon().encodedAuthority("${uri.host}:8891").build().toString()
    }
  }

  private fun isPortrait(): Boolean =
    if (width > 0 && height > 0) height >= width
    else resources.configuration.orientation != android.content.res.Configuration.ORIENTATION_LANDSCAPE

  private fun fail(
    code: String,
    message: String,
    promise: Promise,
    cause: Throwable? = null,
  ) {
    keepScreenOn = false
    emit(StreamState.ERROR, code = code, message = message)
    promise.reject(code, message, cause)
  }

  private fun emit(
    newState: StreamState,
    attempt: Int? = null,
    code: String? = null,
    message: String? = null,
  ) {
    state = newState
    val payload = mutableMapOf<String, Any>("state" to newState.value)
    attempt?.let { payload["attempt"] = it }
    code?.let { payload["code"] = it }
    message?.let { payload["message"] = it }
    onStateChange(payload)
  }

  private fun startStatsLoop() {
    stopStatsLoop()
    val runnable =
      object : Runnable {
        override fun run() {
          emitStats()
          if (state == StreamState.LIVE && !intentionalStop) {
            postDelayed(this, 1_000L)
          }
        }
      }
    statsRunnable = runnable
    post(runnable)
  }

  private fun stopStatsLoop() {
    statsRunnable?.let { removeCallbacks(it) }
    statsRunnable = null
  }

  private fun emitStats() {
    if (bondingMode != "off") {
      val stats = BondedSrtNative.stats() ?: return
      val degraded =
        stats.links.filter { it["state"] == "connected" }.size < 2
      if (degraded != lastLinkDegraded) {
        lastLinkDegraded = degraded
        if (degraded) {
          emit(
            StreamState.LIVE,
            code = "link-degraded",
            message = "One bonded network link is unavailable.",
          )
        } else {
          emit(StreamState.LIVE, code = "links-restored")
        }
      }
      onStats(
        mapOf(
          "bitrateKbps" to stats.bitrateKbps,
          "targetBitrateKbps" to (targetBitrateBps / 1_000).coerceAtLeast(0),
          "rttMs" to stats.rttMs,
          "packetLossPct" to stats.packetLossPct.coerceIn(0.0, 100.0),
          "links" to stats.links,
        ),
      )
      return
    }
    val current = stream as? SrtStream ?: return
    val client = current.getStreamClient()
    val rttMs = (client.getRtt() / 1_000).coerceAtLeast(0)
    val packetsLost = client.getPacketsLost()
    val bytesSent = client.getBytesSend()
    val lostDelta = (packetsLost - lastPacketsLost).coerceAtLeast(0)
    val sentDelta = ((bytesSent - lastBytesSent).coerceAtLeast(0L) / SRT_PAYLOAD_SIZE)
    lastPacketsLost = packetsLost
    lastBytesSent = bytesSent
    val packetLossPct =
      if (sentDelta + lostDelta > 0) {
        (100.0 * lostDelta / (sentDelta + lostDelta)).coerceIn(0.0, 100.0)
      } else {
        0.0
      }
    check(packetLossPct in 0.0..100.0)
    onStats(
      mapOf(
        "bitrateKbps" to (measuredBitrateBps / 1_000L).toInt().coerceAtLeast(0),
        "targetBitrateKbps" to (targetBitrateBps / 1_000).coerceAtLeast(0),
        "rttMs" to rttMs,
        "packetLossPct" to packetLossPct,
      ),
    )
  }

  private companion object {
    val REQUIRED_PERMISSIONS = arrayOf(
      Manifest.permission.CAMERA,
      Manifest.permission.RECORD_AUDIO,
    )
    val RETRY_DELAYS = listOf(1_000L, 2_000L, 4_000L)
    val COMMON_FRAME_RATES = listOf(15, 24, 25, 30, 50, 60, 120)
    const val AUDIO_BITRATE = 96_000
    const val SRT_PAYLOAD_SIZE = 1_316
    const val AUDIO_INPUT_UNAVAILABLE = "That microphone is no longer available."
    // RootEncoder documents 8/16/22.5/32/44.1 kHz; 48 kHz is not listed.
    const val AUDIO_SAMPLE_RATE = 44_100
    const val KEYFRAME_INTERVAL = 2
    const val VIDEO_BITRATE = 3_500_000
    const val CAMERA_UNAVAILABLE = "The camera or microphone is unavailable."
    const val CONFIGURATION_UNAVAILABLE = "That camera setting is not available on this device."
    const val DEFAULT_AUDIO_INPUT_ID = "default"
    const val CONNECTION_FAILED = "VISP could not connect to the relay."
    const val INVALID_URL = "Paste the SRT publish URL supplied by VISP."
    const val PERMISSION_DENIED = "Camera and microphone access is required."
    const val STABILIZATION_UNAVAILABLE = "Image stabilization is not available for this camera setting."
  }
}

private fun VideoConfiguration.toMap(): Map<String, Any> = mapOf(
  "cameraId" to cameraId,
  "fps" to fps,
  "height" to height,
  "width" to width,
)
