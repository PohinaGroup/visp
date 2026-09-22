export type PortraitCrop = {
	x: number;
	y: number;
	w: number;
	h: number;
	aspect: string;
};

/** A full-height 9:16 crop of a 16:9 frame is 81/256 of its width. */
export const PORTRAIT_WIDTH_RATIO = 81 / 256;

export const CROP_STEP = 0.001;

export const DEFAULT_PORTRAIT_CROP: PortraitCrop = {
	x: 0.3418,
	y: 0,
	w: 0.3164,
	h: 1,
	aspect: "9:16",
};

export function cropWithHeight(
	crop: PortraitCrop,
	height: number,
): PortraitCrop {
	const h = Math.max(0.25, Math.min(height, 1 - crop.y));
	const w = h * PORTRAIT_WIDTH_RATIO;
	return {
		...crop,
		h,
		w,
		x: Math.min(crop.x, 1 - w),
	};
}

/**
 * SwiftUI and Compose sliders crash on an empty range, and the default
 * full-height crop leaves zero vertical travel.
 */
export function cropSliderRange(min: number, max: number) {
	return max > min
		? { max, disabled: false }
		: { max: min + CROP_STEP, disabled: true };
}
