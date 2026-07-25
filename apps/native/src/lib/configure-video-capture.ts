import { videoBitrateCeilingKbps } from "@VISP/api/link-stats";
import type {
	VideoConfiguration,
	VispSrtViewRef,
} from "../../modules/visp-srt";
import { parsePublishCredentials } from "./stream-url-validation";

export function resolvePublishPathId(
	streamUrl: string | undefined,
	devices: ReadonlyArray<{ id: number; slug: string }>,
): number | undefined {
	if (!streamUrl) return undefined;
	try {
		const { path } = parsePublishCredentials(streamUrl);
		return devices.find((device) => device.slug === path)?.id;
	} catch {
		return undefined;
	}
}

export async function configureVideoCapture(
	camera: VispSrtViewRef | null | undefined,
	selected: VideoConfiguration,
): Promise<void> {
	await camera?.configure(
		selected.cameraId,
		selected.width,
		selected.height,
		selected.fps,
		videoBitrateCeilingKbps(selected.width, selected.height, selected.fps),
	);
}
