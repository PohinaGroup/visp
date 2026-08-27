export type DirectCrop = {
	x: number;
	y: number;
	w: number;
	h: number;
	aspect: string;
};

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
	const target = Number(match[1]) / Number(match[2]);
	const actual = (crop.w * 16) / (crop.h * 9);
	return !target || Math.abs(actual / target - 1) > 0.01
		? "Crop must match its target aspect"
		: null;
}

export function buildPortraitFilter(crop: DirectCrop) {
	const [width = 9, height = 16] = crop.aspect.split(":").map(Number);
	const outputHeight = 1920;
	const outputWidth = Math.round((outputHeight * width) / height / 2) * 2;
	return `crop=iw*${crop.w}:ih*${crop.h}:iw*${crop.x}:ih*${crop.y},scale=${outputWidth}:${outputHeight}`;
}
