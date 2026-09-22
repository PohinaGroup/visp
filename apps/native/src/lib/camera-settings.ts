import type {
	CameraCapability,
	VideoConfiguration,
	VideoFormatCapability,
} from "../../modules/visp-srt";

export const DEFAULT_IMAGE_STABILIZATION = true;

export type QualityPreset = {
	fps: number;
	height: number;
	label: string;
	value: string;
	width: number;
};

const QUALITY_PRESETS: QualityPreset[] = [
	{
		fps: 30,
		height: 720,
		label: "Reliable · 720p30",
		value: "reliable",
		width: 1280,
	},
	{
		fps: 30,
		height: 1080,
		label: "Balanced · 1080p30",
		value: "balanced",
		width: 1920,
	},
	{
		fps: 60,
		height: 1080,
		label: "Motion · 1080p60",
		value: "motion",
		width: 1920,
	},
];

/** Presets that the selected camera can capture without coercing the format. */
export function qualityPresets(camera: CameraCapability): QualityPreset[] {
	return QUALITY_PRESETS.filter((preset) =>
		camera.formats.some(
			(format) =>
				format.width === preset.width &&
				format.height === preset.height &&
				format.fps.includes(preset.fps),
		),
	);
}

export function qualityPresetValue(configuration: VideoConfiguration): string {
	return (
		QUALITY_PRESETS.find(
			(preset) =>
				preset.width === configuration.width &&
				preset.height === configuration.height &&
				preset.fps === configuration.fps,
		)?.value ?? "custom"
	);
}

const preferredFormat = (camera: CameraCapability) =>
	camera.formats.find(
		({ width, height }) => width === 1920 && height === 1080,
	) ??
	camera.formats.find(
		({ width, height }) => width === 1280 && height === 720,
	) ??
	camera.formats[0];

export function configurationForCamera(
	camera: CameraCapability,
	current?: VideoConfiguration,
): VideoConfiguration {
	const format =
		camera.formats.find(
			({ width, height }) =>
				width === current?.width && height === current.height,
		) ?? preferredFormat(camera);
	if (!format) {
		throw new Error("The selected camera has no streamable video formats.");
	}
	return configurationForFormat(camera.id, format, current?.fps);
}

export function configurationForFormat(
	cameraId: CameraCapability["id"],
	format: VideoFormatCapability,
	preferredFps?: number,
): VideoConfiguration {
	const fps = format.fps.includes(preferredFps ?? 30)
		? (preferredFps ?? 30)
		: (format.fps.find((value) => value === 30) ?? format.fps.at(-1));
	if (!fps) {
		throw new Error("The selected resolution has no supported frame rates.");
	}
	return { cameraId, fps, height: format.height, width: format.width };
}

export function configurationForLiveCamera(
	camera: CameraCapability,
	current?: VideoConfiguration,
): VideoConfiguration {
	if (
		!current ||
		!camera.formats.some(
			({ fps, height, width }) =>
				height === current.height &&
				width === current.width &&
				fps.includes(current.fps),
		)
	) {
		throw new Error(
			"The selected camera does not support the current stream settings.",
		);
	}
	return { ...current, cameraId: camera.id };
}

export function formatLabel({ height, width }: VideoConfiguration): string {
	return width * 9 === height * 16 ? `${height}p` : `${width}×${height}`;
}

export function defaultZoomLevel({ zoomLevels }: CameraCapability): number {
	return zoomLevels.reduce(
		(nearest, level) =>
			Math.abs(level - 1) < Math.abs(nearest - 1) ? level : nearest,
		zoomLevels[0] ?? 1,
	);
}

export function formatZoomLevel(level: number): string {
	return `${level.toFixed(1)}x`;
}

export function supportsImageStabilization(
	camera: CameraCapability | undefined,
	configuration: VideoConfiguration | undefined,
): boolean {
	return Boolean(
		camera &&
			configuration &&
			camera.formats
				.find(
					({ height, width }) =>
						height === configuration.height && width === configuration.width,
				)
				?.stabilizationFps.includes(configuration.fps),
	);
}

export function parseImageStabilizationPreference(
	value: string | null,
): boolean {
	return value === "false" ? false : DEFAULT_IMAGE_STABILIZATION;
}
