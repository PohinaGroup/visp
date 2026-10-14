export type DirectCrop = {
	x: number;
	y: number;
	w: number;
	h: number;
	aspect: string;
};

/** The portrait framings the web and native editors offer. */
export const DIRECT_CROP_ASPECTS = ["9:16"] as const;
/** Upper bound for either side of the scaled portrait output. */
export const DIRECT_CROP_MAX_OUTPUT_SIDE = 3840;

export function directCropError(crop: DirectCrop) {
	const values = [crop.x, crop.y, crop.w, crop.h];
	const match = /^(\d+):(\d+)$/.exec(crop.aspect);
	if (
		values.some((value) => !Number.isFinite(value)) ||
		crop.x < 0 ||
		crop.y < 0 ||
		crop.w <= 0 ||
		crop.h <= 0 ||
		crop.x + crop.w > 1 ||
		crop.y + crop.h > 1 ||
		!match
	) {
		return "Crop must stay within the source frame";
	}
	// The aspect sizes the ffmpeg scale on the relay, so only known framings
	// may reach it.
	if (!(DIRECT_CROP_ASPECTS as readonly string[]).includes(crop.aspect)) {
		return "Crop must match its target aspect";
	}
	const target = Number(match[1]) / Number(match[2]);
	const actual = (crop.w * 16) / (crop.h * 9);
	return !target || Math.abs(actual / target - 1) > 0.01
		? "Crop must match its target aspect"
		: null;
}

function evenSide(value: number) {
	return Math.max(
		2,
		Math.min(DIRECT_CROP_MAX_OUTPUT_SIDE, Math.round(value / 2) * 2),
	);
}

export function buildPortraitFilter(crop: DirectCrop) {
	const [width = 9, height = 16] = crop.aspect.split(":").map(Number);
	const ratio = width / height;
	// 1920 tall for portrait; a wider framing keeps its long side at 1920 so
	// neither side can exceed the cap.
	const outputHeight = evenSide(ratio <= 1 ? 1920 : 1920 / ratio);
	const outputWidth = evenSide(outputHeight * ratio);
	return `crop=iw*${crop.w}:ih*${crop.h}:iw*${crop.x}:ih*${crop.y},scale=${outputWidth}:${outputHeight}`;
}
