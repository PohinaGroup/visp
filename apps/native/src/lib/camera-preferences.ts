import { parseImageStabilizationPreference } from "./camera-settings";
import { storage } from "./storage";

const IMAGE_STABILIZATION_KEY = "visp.camera.image-stabilization";

export async function loadImageStabilizationPreference(): Promise<boolean> {
	return parseImageStabilizationPreference(
		await storage.getItem(IMAGE_STABILIZATION_KEY),
	);
}

export async function saveImageStabilizationPreference(
	enabled: boolean,
): Promise<void> {
	await storage.setItem(IMAGE_STABILIZATION_KEY, String(enabled));
}
