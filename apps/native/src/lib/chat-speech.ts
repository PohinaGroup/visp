import type { ChatMessage } from "@VISP/api/chat/contract";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Speech from "expo-speech";
import { authenticatedPost } from "./backend";
import { type SpokenLanguage, speechUtterance } from "./chat-model";
import { toLanguageCode } from "./spoken-language";
/** How long a clip may take to load before we give up and use the device voice. */
const LOAD_TIMEOUT_MS = 5_000;

type QueueItem = { text: string; language: SpokenLanguage; better: boolean };

// ponytail: unbounded queue, because nothing may be dropped. Under a real flood
// the server's per-user limit answers 429 and every item falls back to the
// device voice, which is fast enough to drain.
const queue: QueueItem[] = [];
const spoken = new Set<string>();
let draining = false;
let stopped = false;
let currentPlayer: ReturnType<typeof createAudioPlayer> | undefined;
type AudioSessionOwner = "capture" | "playback";
let audioSessionOwner: AudioSessionOwner = "playback";
let appliedAudioSessionOwner: AudioSessionOwner | undefined;

/**
 * VispSrtView owns the iOS audio session while the capture preview is up.
 * Playback-only TTS uses a separate .playback session when the camera is down.
 */
export function setChatSpeechAudioOwner(owner: AudioSessionOwner) {
	if (audioSessionOwner === owner) return;
	audioSessionOwner = owner;
	appliedAudioSessionOwner = undefined;
}

/**
 * Queues one chat message for reading. Callers hand over every message that
 * arrives, so duplicates from a socket reconnect are filtered here.
 */
export function enqueueChatMessage(
	message: ChatMessage,
	language: SpokenLanguage,
	betterVoice: boolean,
) {
	const key = `${message.provider}:${message.id}`;
	if (spoken.has(key)) return;
	if (spoken.size > 500) spoken.clear();
	spoken.add(key);
	const text = speechUtterance(message, language);
	if (!text) return;
	stopped = false;
	queue.push({ text, language, better: betterVoice });
	void drain();
}

/** Silences the queue: the picker moved to Off, the stream ended, or we backgrounded. */
export function stopChatSpeech() {
	stopped = true;
	queue.length = 0;
	spoken.clear();
	releasePlayer();
	void Speech.stop();
}

/** False only when the voice list loaded and holds nothing for this language. */
export async function hasVoiceFor(language: SpokenLanguage) {
	try {
		const voices = await Speech.getAvailableVoicesAsync();
		// Web reports an empty list until voices load lazily.
		if (voices.length === 0) return true;
		const code = toLanguageCode(language);
		return voices.some((voice) =>
			voice.language?.toLowerCase().startsWith(code),
		);
	} catch {
		return true;
	}
}

async function drain() {
	if (draining) return;
	draining = true;
	try {
		while (queue.length > 0 && !stopped) {
			const item = queue.shift();
			if (!item) break;
			const played = item.better ? await playBetterVoice(item) : false;
			if (!played && !stopped) await speakOnDevice(item);
		}
	} finally {
		draining = false;
	}
}

/**
 * ElevenLabs through our own server, which holds the key and enforces the
 * flag and the spend limit. Returns false on any failure so the caller drops
 * to the device voice and chat stays audible.
 */
async function playBetterVoice(item: QueueItem) {
	let file: File | undefined;
	try {
		const bytes = await synthesize(item);
		if (!bytes || stopped) return false;
		file = new File(Paths.cache, `visp-tts-${Date.now()}.mp3`);
		file.create({ overwrite: true });
		file.write(bytes);
		await prepareAudioMode();
		if (stopped) return false;
		// False when playback never completed, so the device voice still reads it.
		return await playFile(file.uri);
	} catch {
		return false;
	} finally {
		releasePlayer();
		try {
			file?.delete();
		} catch {
			// A cache file the OS already reclaimed is not a problem.
		}
	}
}

async function synthesize(item: QueueItem) {
	const response = await authenticatedPost("/api/tts", {
		text: item.text,
		language: toLanguageCode(item.language),
	});
	// 403 unflagged, 429 over budget, 503 unconfigured: all mean device voice.
	if (!response.ok) return undefined;
	return new Uint8Array(await response.arrayBuffer());
}

/**
 * While capture is up, inherit VispSrtView's session. Otherwise configure a
 * playback-only session that routes freely and respects the silent switch.
 */
async function prepareAudioMode() {
	if (audioSessionOwner === "capture") {
		appliedAudioSessionOwner = "capture";
		return;
	}
	if (appliedAudioSessionOwner === "playback") return;
	await setAudioModeAsync({
		playsInSilentMode: true,
		allowsRecording: false,
		interruptionMode: "mixWithOthers",
		shouldPlayInBackground: false,
		shouldRouteThroughEarpiece: false,
	});
	appliedAudioSessionOwner = "playback";
}

/** Resolves true only when the clip actually played to the end. */
function playFile(uri: string) {
	return new Promise<boolean>((resolve) => {
		const player = createAudioPlayer(uri, { updateInterval: 100 });
		currentPlayer = player;
		let settled = false;
		// expo-audio reports no playback error, so time is the only signal that a
		// clip will never play. A stuck player must not wedge the queue.
		let guard = setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
		const finish = (played: boolean) => {
			if (settled) return;
			settled = true;
			clearTimeout(guard);
			resolve(played);
		};
		player.addListener("playbackStatusUpdate", (status) => {
			if (status.didJustFinish) {
				finish(true);
				return;
			}
			// Once the duration is known the deadline can be exact instead of generous.
			if (status.isLoaded && status.duration > 0 && !settled) {
				clearTimeout(guard);
				guard = setTimeout(
					() => finish(false),
					status.duration * 1_000 + 2_000,
				);
			}
		});
		player.play();
	});
}

function releasePlayer() {
	const player = currentPlayer;
	currentPlayer = undefined;
	if (!player) return;
	try {
		player.pause();
		player.remove();
	} catch {
		// Already released.
	}
}

function speakOnDevice(item: QueueItem) {
	return new Promise<void>((resolve) => {
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			resolve();
		};
		Speech.speak(item.text, {
			language: item.language,
			pitch: 1,
			rate: 1,
			volume: 1,
			// Stay on the session VispSrtView configured instead of installing
			// another one underneath the broadcast.
			useApplicationAudioSession: true,
			onDone: finish,
			onStopped: finish,
			onError: finish,
		});
	});
}
