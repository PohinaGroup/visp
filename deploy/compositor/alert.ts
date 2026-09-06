import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
	const work = await mkdtemp(join(tmpdir(), "visp-alert-"));
	try {
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
		await writeFile(join(work, "alert.html"), html, { mode: 0o600 });
		const chrome = Bun.spawn(
			[
				process.env.CHROMIUM_BIN ?? "chromium",
				"--headless",
				"--disable-background-networking",
				"--disable-extensions",
				"--disable-sync",
				"--no-first-run",
				"--no-default-browser-check",
				"--hide-scrollbars",
				"--no-pdf-header-footer",
				"--host-resolver-rules=MAP * ~NOTFOUND",
				"--default-background-color=00000000",
				"--force-device-scale-factor=1",
				"--run-all-compositor-stages-before-draw",
				"--virtual-time-budget=1000",
				`--user-data-dir=${work}/profile`,
				`--window-size=${input.width},${input.height}`,
				`--screenshot=${work}/alert.png`,
				`file://${work}/alert.html`,
			],
			{ stdin: "ignore", stdout: "ignore", stderr: "ignore" },
		);
		const timer = setTimeout(() => chrome.kill(), 8_000);
		try {
			if ((await chrome.exited) !== 0)
				throw new Error("Alert text could not be rendered");
			return await readFile(join(work, "alert.png"));
		} finally {
			clearTimeout(timer);
		}
	} finally {
		await rm(work, { recursive: true, force: true });
	}
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
