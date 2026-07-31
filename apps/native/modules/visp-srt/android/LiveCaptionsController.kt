package com.visp.mobile.srt

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * On-device SpeechRecognizer or ElevenLabs Scribe realtime captions.
 * Better mode consumes PCM from the stream CustomAudioEffect; native mode uses
 * the system recognizer (best-effort alongside the broadcast mic).
 */
class LiveCaptionsController(
  private val context: Context,
  private val onCaption: (String) -> Unit,
) {
  private enum class Mode { OFF, NATIVE, BETTER }

  private val mainHandler = Handler(Looper.getMainLooper())
  private val mode = AtomicReference(Mode.OFF)
  private val running = AtomicBoolean(false)
  private var speechRecognizer: SpeechRecognizer? = null
  private var webSocket: WebSocket? = null
  private var languageTag = "en-US"
  private var wsUrl: String? = null
  private val pcmLock = Any()
  private val pcmAccum = ArrayList<Byte>()
  private val chunkBytes = 3_200 * 2
  private var lastCaption = ""
  private val http = OkHttpClient()

  fun start(language: String, better: Boolean, wsUrl: String?) {
    stop()
    // JS maps LanguageCode → BCP-47 locale before calling; accept either form.
    languageTag = if (language.startsWith("fi")) "fi-FI" else "en-US"
    this.wsUrl = wsUrl
    mode.set(if (better) Mode.BETTER else Mode.NATIVE)
    running.set(true)
    if (better) {
      startScribe()
    } else {
      mainHandler.post { startNative() }
    }
  }

  fun stop() {
    running.set(false)
    mode.set(Mode.OFF)
    mainHandler.post {
      speechRecognizer?.cancel()
      speechRecognizer?.destroy()
      speechRecognizer = null
    }
    webSocket?.close(1000, null)
    webSocket = null
    synchronized(pcmLock) { pcmAccum.clear() }
    publish("")
  }

  fun onPcm(buffer: ByteArray) {
    if (mode.get() != Mode.BETTER || !running.get()) return
    // Stream audio is 44.1 kHz mono s16le; Scribe token expects 16 kHz.
    val downsampled = downsample44100To16000(buffer) ?: return
    val payload: ByteArray?
    synchronized(pcmLock) {
      for (b in downsampled) pcmAccum.add(b)
      if (pcmAccum.size < chunkBytes) {
        payload = null
      } else {
        payload = ByteArray(chunkBytes)
        for (i in 0 until chunkBytes) payload[i] = pcmAccum.removeAt(0)
      }
    }
    if (payload == null) return
    val socket = webSocket ?: return
    val body =
      JSONObject()
        .put("message_type", "input_audio_chunk")
        .put("audio_base_64", Base64.encodeToString(payload, Base64.NO_WRAP))
        .put("commit", false)
        .put("sample_rate", 16_000)
    socket.send(body.toString())
  }

  private fun downsample44100To16000(input: ByteArray): ByteArray? {
    if (input.size < 4) return null
    val inSamples = input.size / 2
    val outSamples = (inSamples * 16_000L / 44_100L).toInt().coerceAtLeast(1)
    val output = ByteArray(outSamples * 2)
    var outIndex = 0
    for (i in 0 until outSamples) {
      val src = (i * 44_100L / 16_000L).toInt().coerceIn(0, inSamples - 1) * 2
      output[outIndex++] = input[src]
      output[outIndex++] = input[src + 1]
    }
    return output
  }

  private fun startScribe() {
    val url = wsUrl ?: return
    val request = Request.Builder().url(url).build()
    webSocket =
      http.newWebSocket(
        request,
        object : WebSocketListener() {
          override fun onMessage(webSocket: WebSocket, text: String) {
            val json = runCatching { JSONObject(text) }.getOrNull() ?: return
            val type = json.optString("message_type")
            if (type == "partial_transcript" || type == "committed_transcript") {
              publish(json.optString("text"))
            }
          }

          override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            // Leave captions blank on failure; JS can restart on next live cycle.
          }
        },
      )
  }

  private fun startNative() {
    if (!running.get() || mode.get() != Mode.NATIVE) return
    if (!SpeechRecognizer.isRecognitionAvailable(context)) return
    val recognizer = SpeechRecognizer.createSpeechRecognizer(context)
    speechRecognizer = recognizer
    recognizer.setRecognitionListener(
      object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {}

        override fun onBeginningOfSpeech() {}

        override fun onRmsChanged(rmsdB: Float) {}

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {}

        override fun onError(error: Int) {
          if (running.get() && mode.get() == Mode.NATIVE) {
            mainHandler.postDelayed({ startNative() }, 400)
          }
        }

        override fun onResults(results: Bundle?) {
          val text =
            results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
          if (!text.isNullOrBlank()) publish(text)
          if (running.get() && mode.get() == Mode.NATIVE) {
            mainHandler.post { startNative() }
          }
        }

        override fun onPartialResults(partialResults: Bundle?) {
          val text =
            partialResults
              ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
              ?.firstOrNull()
          if (!text.isNullOrBlank()) publish(text)
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
      },
    )
    val intent =
      Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(
          RecognizerIntent.EXTRA_LANGUAGE_MODEL,
          RecognizerIntent.LANGUAGE_MODEL_FREE_FORM,
        )
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, languageTag)
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
      }
    recognizer.startListening(intent)
  }

  private fun publish(text: String) {
    if (text == lastCaption) return
    lastCaption = text
    mainHandler.post { onCaption(text) }
  }
}
