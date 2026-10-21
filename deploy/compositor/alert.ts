import barlow400 from "../../apps/web/public/fonts/studio/barlow-400.woff2" with {
	type: "file",
};
import barlow700 from "../../apps/web/public/fonts/studio/barlow-700.woff2" with {
	type: "file",
};
import condensed400 from "../../apps/web/public/fonts/studio/barlow-condensed-400.woff2" with {
	type: "file",
};
import condensed700 from "../../apps/web/public/fonts/studio/barlow-condensed-700.woff2" with {
	type: "file",
};
import mono400 from "../../apps/web/public/fonts/studio/ibm-plex-mono-400.woff2" with {
	type: "file",
};
import mono700 from "../../apps/web/public/fonts/studio/ibm-plex-mono-700.woff2" with {
	type: "file",
};
import {
	type StudioAlertAppearance,
	studioAlertHtml,
	studioAlertLayout,
} from "../../packages/api/src/studio-alert";

import { renderStudioHtmlPng } from "./html";

const fonts = {
	barlow: { 400: barlow400, 700: barlow700 },
	"barlow-condensed": { 400: condensed400, 700: condensed700 },
	"ibm-plex-mono": { 400: mono400, 700: mono700 },
};

export async function renderStudioAlertPng(input: {
	width: number;
	height: number;
	appearance: StudioAlertAppearance;
	label: string;
	hasMedia: boolean;
}) {
	const font = Buffer.from(
		await Bun.file(
			fonts[input.appearance.font][input.appearance.fontWeight],
		).arrayBuffer(),
	).toString("base64");
	const html = studioAlertHtml({
		...input,
		textOnly: true,
		fontUrl: `data:font/woff2;base64,${font}`,
	});
	return renderStudioHtmlPng({ ...input, html });
}

export function studioAlertFilters(input: {
	base: string;
	output: string;
	textInput: number;
	mediaInput?: number;
	x: number;
	y: number;
	width: number;
	height: number;
	appearance: StudioAlertAppearance;
}) {
	const {
		base,
		output,
		textInput,
		mediaInput,
		x,
		y,
		width,
		height,
		appearance,
	} = input;
	const filters: string[] = [];
	let current = base;
	if (appearance.background !== "transparent") {
		filters.push(
			`${current}drawbox=x=${x}:y=${y}:w=${width}:h=${height}:color=${appearance.background}:t=fill[${output}bg]`,
		);
		current = `[${output}bg]`;
	}
	const { media } = studioAlertLayout(
		width,
		height,
		appearance,
		mediaInput !== undefined,
	);
	if (media && mediaInput !== undefined) {
		filters.push(
			`[${mediaInput}:v]setpts=PTS-STARTPTS,format=rgba,scale=${media.width}:${media.height}:force_original_aspect_ratio=decrease,pad=${media.width}:${media.height}:(ow-iw)/2:(oh-ih)/2:color=black@0[${output}image]`,
		);
		filters.push(
			`${current}[${output}image]overlay=${x + media.x}:${y + media.y}:eof_action=repeat[${output}media]`,
		);
		current = `[${output}media]`;
	}
	filters.push(`[${textInput}:v]crop=${width}:${height}:0:0[${output}text]`);
	filters.push(
		`${current}[${output}text]overlay=${x}:${y}:eof_action=repeat[${output}]`,
	);
	return filters;
}
