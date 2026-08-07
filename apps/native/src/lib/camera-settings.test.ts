import { describe, expect, test } from "bun:test";
import type { CameraCapability } from "../../modules/visp-srt";
import {
	configurationForCamera,
	configurationForFormat,
	configurationForLiveCamera,
	defaultZoomLevel,
	formatLabel,
	formatZoomLevel,
	parseImageStabilizationPreference,
	supportsImageStabilization,
} from "./camera-settings";

const camera: CameraCapability = {
	id: "back",
	name: "Rear camera",
	zoomLevels: [0.5, 1, 2],
	formats: [
		{
			fps: [24, 30, 60],
			height: 1080,
			stabilizationFps: [24, 30],
			width: 1920,
		},
		{
			fps: [24, 30],
			height: 720,
			stabilizationFps: [],
			width: 1280,
		},
	],
};

describe("camera settings", () => {
	test("prefers 1080p at 30 fps and preserves supported choices", () => {
		const firstFormat = camera.formats[0];
		expect(firstFormat).toBeDefined();
		expect(configurationForCamera(camera)).toEqual({
			cameraId: "back",
			fps: 30,
			height: 1080,
			width: 1920,
		});
		if (!firstFormat) return;
		expect(configurationForFormat("back", firstFormat, 60).fps).toBe(60);
		expect(
			configurationForLiveCamera(
				{ ...camera, id: "front" },
				configurationForCamera(camera),
			).cameraId,
		).toBe("front");
		expect(() =>
			configurationForLiveCamera(
				{ ...camera, formats: [], id: "front" },
				configurationForCamera(camera),
			),
		).toThrow("does not support");
		expect(formatLabel(configurationForCamera(camera))).toBe("1080p");
		expect(defaultZoomLevel(camera)).toBe(1);
		expect(defaultZoomLevel({ ...camera, zoomLevels: [0.5, 2] })).toBe(0.5);
		expect(formatZoomLevel(2)).toBe("2.0x");
	});

	test("reports stabilization for the selected format and frame rate", () => {
		expect(
			supportsImageStabilization(camera, {
				cameraId: "back",
				fps: 30,
				height: 1080,
				width: 1920,
			}),
		).toBe(true);
		expect(
			supportsImageStabilization(camera, {
				cameraId: "back",
				fps: 60,
				height: 1080,
				width: 1920,
			}),
		).toBe(false);
		expect(supportsImageStabilization(undefined, undefined)).toBe(false);
	});

	test("defaults stabilization on unless explicitly disabled", () => {
		expect(parseImageStabilizationPreference(null)).toBe(true);
		expect(parseImageStabilizationPreference("invalid")).toBe(true);
		expect(parseImageStabilizationPreference("true")).toBe(true);
		expect(parseImageStabilizationPreference("false")).toBe(false);
	});
});
