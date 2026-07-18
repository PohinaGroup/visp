import { NativeModule, requireNativeModule } from "expo";

declare class VispSrtModule extends NativeModule<Record<string, never>> {
	syncWatchSnapshot(json: string): void;
}

export default requireNativeModule<VispSrtModule>("VispSrt");
