# Choose the audio output device for TTS (apps/native)

## Context

Chat read-aloud (`chat-speech.ts`) only runs while broadcasting, and today it always lands on the phone speaker — which the broadcast microphone then picks up. The settings footer at `apps/native/src/app/index.tsx:1964` literally apologises for it ("Use headphones, because the phone speaker is picked up by the microphone"). There is a Microphone **input** picker but no output control at all.

Two concrete causes, both verified:

1. `modules/visp-srt/ios/VispSrtView.swift:218-222` sets `.playAndRecord` with `[.defaultToSpeaker, .allowBluetoothHFP]`. Without `.allowBluetoothA2DP` / `.allowAirPlay`, a connected AirPod/BT speaker **cannot** receive audio unless it is also made the broadcast mic (HFP, mono).
2. `chat-speech.ts:142` `prepareAudioMode()` calls `setAudioModeAsync`, and expo-audio's iOS impl (`node_modules/expo-audio/ios/AudioModule.swift:789-820`) *re-sets the whole category* to `mode: .default` with only `[mixWithOthers, defaultToSpeaker, allowBluetoothHFP]`, clobbering the `mode: .videoRecording` and options the SRT module chose.

Second, TTS is currently gated on being live (`index.tsx:404-406`, `ACTIVE_STATES.has(state)`), so there is no way to try a voice out — people want to check it with their bot account before going live. That gate has to go, which also means the audio session can no longer be assumed to be the one the SRT module set up.

Goal: let the user pick which device hears the TTS, using each platform's native mechanism, with the full device list, working whether or not the stream is up.

## Platform reality (why the two sides differ)

- **iOS** has no "available outputs" API (`availableInputs` has no output twin) and one route per app session. The native full-device-list control is `AVRoutePickerView` (the system route sheet: speaker, BT, AirPlay, CarPlay). Because there is one session, fixing it there routes *everything* — expo-audio playback and `Speech.speak(useApplicationAudioSession: true)` alike, with no player changes.
- **Android** enumerates outputs freely (`AudioManager.getDevices(GET_DEVICES_OUTPUTS)`) but routing is per-player: expo-audio wraps ExoPlayer (`android/.../AudioPlayer.kt:37`) and exposes no preferred-device API, and `TextToSpeech` cannot target a device at all. So Android needs a picker (matching the existing native `UI.Picker` used for Microphone) plus playback we own.

## iOS

**1. Session options** — `modules/visp-srt/ios/VispSrtView.swift:218-222`, add to the options set:

```swift
options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP, .allowAirPlay]
```

`.defaultToSpeaker` stays: it is only the fallback when nothing is connected.

**2. Rewrite `prepareAudioMode()`** — `apps/native/src/lib/chat-speech.ts` (lines 22, 96, 137-152). Two owners now, because TTS also runs before going live:

- **Capture session up** (the SRT preview is running — `VispSrtView.prepare()` configures *and activates* the session for the preview, not just for the stream): do nothing, inherit it. Calling `setAudioModeAsync` here is what breaks the route today.
- **No capture session** (camera view not mounted/prepared, permission denied, or suspended): `setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false, interruptionMode: "mixWithOthers" })` → `.playback` category, which already routes freely to A2DP/AirPlay and honours the silent switch correctly. The route picker works in this state too.

Replace the `audioModeReady` one-shot latch with the last-applied ownership, and re-apply on flip — `VispSrtView.suspend()` deactivates the session (`VispSrtView.swift:835`), so a latch that never resets leaves TTS on a dead session. Ownership is known in `index.tsx` from `state`; pass it down rather than guessing in the lib.

Expo-audio touches the category *only* inside `setAudioModeAsync` (`OnCreate` at `AudioModule.swift:21` does not), so leaving it uncalled is safe. `Speech.speak(useApplicationAudioSession: true)` follows whichever session is active either way.

**3. Route picker view** — new `modules/visp-srt/ios/VispRoutePickerView.swift`: an `ExpoView` hosting an `AVRoutePickerView` pinned to bounds, with `activeTintColor` / `tintColor` props. Register it in `modules/visp-srt/ios/VispSrtModule.swift` next to the existing `View(VispSrtView.self)` block (line 29).

**4. Current route label** — in `VispSrtModule.swift`, add `Function("currentAudioOutput")` returning `AVAudioSession.sharedInstance().currentRoute.outputs.first?.portName`, and an `onAudioRouteChange` event fed by an `AVAudioSession.routeChangeNotification` observer registered in `OnStartObserving` / torn down in `OnStopObserving` — mirroring the existing `WatchBridge` pattern at `VispSrtModule.swift:9-19`.

iOS gets no picker list of its own; the system sheet **is** the list.

## Android

**1. Device list** — `modules/visp-srt/android/VispSrt.kt`: add `audioOutputs()` mirroring `audioInputs()` (line 1217) with `AudioManager.GET_DEVICES_OUTPUTS`, filtered to real sinks (`BUILTIN_SPEAKER`, `BUILTIN_EARPIECE`, `WIRED_HEADSET`, `WIRED_HEADPHONES`, `USB_*`, `BLUETOOTH_A2DP`, `BLE_HEADSET`/`BLE_SPEAKER`, `HEARING_AID`) and labelled by `productName`.

Expose it as a **module-level** `AsyncFunction("audioOutputs")` on `VispSrt` (line 94), not through the view's `capabilities()`. The mic picker can be view-scoped because capture needs the view; the output list must not be — the whole point is that TTS works with no camera session. It only needs `appContext.reactContext` for `AUDIO_SERVICE`.

**2. Routed playback** — module-level `AsyncFunction`s on `VispSrt` (Android only; they need no camera view):

- `playAudioFile(uri: String, outputDeviceId: String)` — `MediaPlayer` with `USAGE_MEDIA` attributes, `setPreferredDevice(match)`, promise resolved on completion / rejected on error, released in both paths.
- `speakToDevice(text: String, language: String, outputDeviceId: String)` — `TextToSpeech.synthesizeToFile()` into `cacheDir`, then the same `MediaPlayer` path, so the *device-voice fallback* is routable too (plain `TextToSpeech.speak` is not). Delete the temp file when done.

Add matching no-op/`UnavailableException` stubs is unnecessary — guard the calls by `Platform.OS` in JS.

Nothing here depends on the SRT session, so the Android path already works while idle.

## JS wiring

- **Ungate the speech** — `index.tsx:397-406`: drop `ACTIVE_STATES.has(state)` from `speechActive`, keep `appState === "active"`. The chat socket is already independent of the stream (`useLiveChat(userId, appState === "active", …)`, `index.tsx:415-419`), so messages arrive while idle and read aloud immediately — that is the "test it with the bot account" path. Rewrite the now-wrong comment at `:397-399` ("going live is what configures the audio session") and keep the `stopChatSpeech()` effect at `:408-411` keyed on the new `speechActive`.
- **`apps/native/src/lib/audio-preferences.ts`** (already exists, same domain): add `loadSpeechOutput` / `saveSpeechOutput` under key `visp.audio.output`, defaulting to `"default"`. iOS needs no persistence — the system route is system state.
- **`apps/native/src/lib/chat-speech.ts`**: `enqueueChatMessage` gains an `outputId` on the queue item. In `drain()`, when `Platform.OS === "android" && outputId !== "default"`, route `playBetterVoice`'s file through `playAudioFile` and `speakOnDevice` through `speakToDevice`; otherwise keep the existing expo-audio / expo-speech path untouched so nobody who never opens the setting changes behaviour.
- **`apps/native/src/app/index.tsx`**, Chat settings section beside "Better voice" (`:1946-1958`): on Android a `UI.Picker` labelled "Speak to" ("System default" + every `audioOutputs` entry), built exactly like the Microphone picker at `:1767-1783`; on iOS a `SettingRow` whose value is the current route name and whose control is `<VispRoutePicker>`. Update the footer text at `:1964` — the headphones apology is no longer needed.
- Web: unchanged (better voice is already `!IS_WEB`; hide the row).

## Verification

- `bun test src` in `apps/native` — extend `src/lib/audio-preferences.test.ts` for the new load/save round-trip and `src/lib/chat-speech.test.ts` for the Android branch selection (mock the native module).
- Compile-check both native sides per the inline-module build (Swift into the app target, Kotlin into `:expo`).
- Manual, not live: with the app idle on the camera screen, have the bot post a message → it reads aloud. Then background/foreground the app and repeat, and try it once with camera permission denied (no capture session at all) — the `.playback` fallback must still be audible, including with the ringer switch muted.
- Manual, the actual acceptance test: pair AirPods, keep the built-in/wired mic selected, go live, send a chat message.
  - iOS: audio in the AirPods, not the speaker; tap the route button and confirm the sheet lists speaker + AirPods + AirPlay targets and that switching takes effect on the next message.
  - Android: pick the AirPods in the "Speak to" picker; confirm both a better-voice message and a device-voice message (turn "Better voice" off) land there.
  - Both: confirm the SRT stream's own audio is unaffected and capture does not drop when a clip plays or the route changes — in particular start speech while idle, then go live mid-utterance, and stop the stream mid-utterance.
