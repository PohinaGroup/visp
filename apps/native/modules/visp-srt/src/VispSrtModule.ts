import { NativeModule, requireNativeModule } from "expo";
import type { AudioOutputCapability } from "./VispSrt.types";

type VispSrtEvents = {
	onAudioRouteChange(event: { name?: string }): void;
	onWatchSceneCommand(event: { requestId: string; scene: string }): void;
};

declare class VispSrtModule extends NativeModule<VispSrtEvents> {
	audioOutputs(): Promise<AudioOutputCapability[]>;
	currentAudioOutput(): string | null;
	playAudioFile(uri: string, outputDeviceId: string): Promise<void>;
	syncWatchSnapshot(json: string): void;
	replyToWatchSceneCommand(requestId: string, error: string | null): void;
	speakToDevice(
		text: string,
		language: string,
		outputDeviceId: string,
	): Promise<void>;
}

export default requireNativeModule<VispSrtModule>("VispSrt");
