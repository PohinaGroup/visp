import { storage } from "./storage";

const SPEECH_OUTPUT_KEY = "visp.audio.output";

export async function loadSpeechOutput(): Promise<string> {
	return (await storage.getItem(SPEECH_OUTPUT_KEY)) ?? "default";
}

export function saveSpeechOutput(outputId: string): Promise<void> {
	return storage.setItem(SPEECH_OUTPUT_KEY, outputId);
}
