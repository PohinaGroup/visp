import { z } from "zod";

export const STUDIO_ALERT_EVENTS = ["follow", "sub", "donation"] as const;
export const STUDIO_ALERT_FONTS = [
	"barlow",
	"barlow-condensed",
	"ibm-plex-mono",
] as const;
export const STUDIO_MEDIA_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
] as const;
export const STUDIO_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const studioAlertAppearanceSchema = z.object({
	font: z.enum(STUDIO_ALERT_FONTS).default("barlow"),
	fontSize: z.number().int().min(12).max(200).default(48),
	fontWeight: z.union([z.literal(400), z.literal(700)]).default(700),
	color: color.default("#ffffff"),
	outline: z.number().int().min(0).max(8).default(2),
	outlineColor: color.default("#000000"),
	shadow: z.boolean().default(true),
	background: z.union([color, z.literal("transparent")]).default("transparent"),
	layout: z.enum(["above", "beside", "behind", "image-only"]).default("above"),
	imageSize: z.number().int().min(10).max(90).default(55),
	gap: z.number().int().min(0).max(80).default(16),
	duration: z.number().int().min(1).max(30).default(10),
});
export type StudioAlertAppearance = z.infer<typeof studioAlertAppearanceSchema>;
export const DEFAULT_ALERT_APPEARANCE = studioAlertAppearanceSchema.parse({});

export function studioAlertAppearance(layer: {
	height: number;
	appearance?: StudioAlertAppearance;
}) {
	return (
		layer.appearance ?? {
			...DEFAULT_ALERT_APPEARANCE,
			background: "#202020",
			fontSize: Math.max(12, Math.min(layer.height, 200)),
		}
	);
}

export function studioAlertEvents(layer: {
	event?: string;
	events?: string[];
}) {
	return layer.events ?? [layer.event ?? "follow"];
}

export function studioAlertLayout(
	width: number,
	height: number,
	appearance: StudioAlertAppearance,
	hasMedia: boolean,
) {
	const full = { x: 0, y: 0, width, height };
	if (!hasMedia) return { text: full, media: null };
	const fraction = appearance.imageSize / 100;
	if (appearance.layout === "above") {
		const imageHeight = Math.max(1, Math.floor(height * fraction));
		const y = Math.min(height - 1, imageHeight + appearance.gap);
		return {
			media: { ...full, height: imageHeight },
			text: { ...full, y, height: height - y },
		};
	}
	if (appearance.layout === "beside") {
		const imageWidth = Math.max(1, Math.floor(width * fraction));
		const x = Math.min(width - 1, imageWidth + appearance.gap);
		return {
			media: { ...full, width: imageWidth },
			text: { ...full, x, width: width - x },
		};
	}
	const w = Math.max(1, Math.floor(width * fraction));
	const h = Math.max(1, Math.floor(height * fraction));
	return {
		media: {
			x: Math.floor((width - w) / 2),
			y: Math.floor((height - h) / 2),
			width: w,
			height: h,
		},
		text: appearance.layout === "image-only" ? null : full,
	};
}

const escapeHtml = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(char) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				char
			] ?? char,
	);

// Both the editor and compositor render this document. Media is a separate
// FFmpeg input on air so GIF frames keep playing between state polls.
export function studioAlertHtml(input: {
	width: number;
	height: number;
	appearance: StudioAlertAppearance;
	label: string;
	fontUrl: string;
	hasMedia: boolean;
	mediaUrl?: string;
	textOnly?: boolean;
}) {
	const { width, height, appearance: a } = input;
	const { text, media } = studioAlertLayout(width, height, a, input.hasMedia);
	const rect = (r: NonNullable<typeof text>) =>
		`position:absolute;left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px;`;
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data: https: http:; img-src data: https: http:"><style>
@font-face{font-family:Alert;src:url("${escapeHtml(input.fontUrl)}") format("woff2");font-weight:${a.fontWeight};font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${input.textOnly ? "transparent" : a.background}}
.text{display:flex;align-items:center;justify-content:center;padding:8px;text-align:center;overflow:hidden;font-family:Alert,sans-serif;font-size:${a.fontSize}px;font-weight:${a.fontWeight};line-height:1.2;color:${a.color};text-shadow:${a.shadow ? "0 2px 4px #000000" : "none"};-webkit-text-stroke:${a.outline}px ${a.outlineColor};paint-order:stroke fill}
.text span{min-width:0;max-width:100%;max-height:100%;overflow:hidden;overflow-wrap:anywhere;white-space:pre-wrap}
</style></head><body>${media && input.mediaUrl && !input.textOnly ? `<img alt="" src="${escapeHtml(input.mediaUrl)}" style="${rect(media)}object-fit:contain">` : ""}${text ? `<div class="text" style="${rect(text)}"><span>${escapeHtml(input.label)}</span></div>` : ""}</body></html>`;
}
