#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { StudioAlertAppearance } from "../../packages/api/src/studio-alert";
import {
	studioAlertAppearance,
	studioAlertEvents,
} from "../../packages/api/src/studio-alert";
import { renderStudioAlertPng, studioAlertFilters } from "./alert";
import { openBrowser } from "./browser";
import { CompositorPipeline } from "./pipeline";
import {
	authenticatedProgramUrls,
	authenticatedRtspUrl,
	browserRefreshDue,
	compositorExited,
	compositorHasPublisher,
	publisherProbeArgs,
	rendererProgressFrames,
	STUDIO_AUDIO_PUBLISH_ARGS,
	shouldCrossfadeScenes,
	studioImageArgs,
	studioReceiveUrl,
	studioVideoArgs,
	studioXfadeFilter,
} from "./state";

const [appUrl, path, inputUrl, outputUrl] = process.argv.slice(2);
if (
	!appUrl ||
	!path ||
	!inputUrl ||
	!outputUrl ||
	!process.env.STUDIO_WORKER_TOKEN ||
	!process.env.STUDIO_MEDIA_USER ||
	!process.env.STUDIO_MEDIA_PASSWORD
) {
	throw new Error(
		"usage: visp-compositor <app-url> <path> <input-rtsp> <output-rtsp>",
	);
}
const programUrls = authenticatedProgramUrls(
	outputUrl,
	process.env.STUDIO_MEDIA_USER,
	process.env.STUDIO_MEDIA_PASSWORD,
);
const authenticatedInputUrl = authenticatedRtspUrl(
	inputUrl,
	process.env.STUDIO_MEDIA_USER,
	process.env.STUDIO_MEDIA_PASSWORD,
);

const safeId = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "");
const work = `/tmp/visp-studio-${safeId(path)}`;
await mkdir(work, { recursive: true, mode: 0o700 });

type Layer = {
	id: string;
	type: "text" | "png" | "browser" | "alert";
	visible: boolean;
	x: number;
	y: number;
	width: number;
	height: number;
	zIndex: number;
	text?: string;
	event?: "follow" | "sub" | "donation";
	events?: string[];
	appearance?: StudioAlertAppearance;
	assetId?: string | null;
	url?: string | null;
	runtimeDisabled?: boolean;
};
type Desired = {
	mode: "program" | "passthrough";
	requestedMode: "program" | "passthrough";
	version: number;
	graph: {
		activeSceneId: string | null;
		scenes: Array<{ id: string; transition: "cut" | "fade"; layers: Layer[] }>;
	};
	alert: { event: string; label: string; at: string } | null;
};

async function hook(route: string, body: object) {
	return fetch(`${appUrl.replace(/\/$/, "")}/api/hooks/studio/${route}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Studio-Token": process.env.STUDIO_WORKER_TOKEN ?? "",
		},
		body: JSON.stringify(body),
	});
}

const browsers = new Map<
	string,
	{ key: string; session: Awaited<ReturnType<typeof openBrowser>> }
>();

async function browserPng(layer: Layer) {
	const key = JSON.stringify([layer.url, layer.width, layer.height]);
	let browser = browsers.get(layer.id);
	try {
		if (!browser || browser.key !== key) {
			await browser?.session.close();
			browsers.delete(layer.id);
			browser = { key, session: await openBrowser(work, layer) };
			browsers.set(layer.id, browser);
		}
		return await browser.session.capture();
	} catch (error) {
		await browser?.session.close();
		browsers.delete(layer.id);
		throw error;
	}
}

async function retainBrowsers(ids: Set<string>) {
	for (const [id, browser] of browsers) {
		if (ids.has(id)) continue;
		await browser.session.close();
		browsers.delete(id);
	}
}

let alertTextCache: { key: string; bytes: Buffer } | undefined;
const pipeline = new CompositorPipeline();
let applied = "";
let appliedSceneId: string | undefined;
let lastBrowserRefresh = 0;
let activeFeedSlot: 0 | 1 | undefined;
let requestedMode: "program" | "passthrough" = "passthrough";
const pathHash = createHash("sha256").update(path).digest();
const programPort = 20_000 + (pathHash.readUInt16BE(0) % 20_000);
const feedPort = 40_000 + (pathHash.readUInt16BE(2) % 10_000) * 2;
const feedHost = "127.0.0.1";
const programOutputUrl = `udp://127.0.0.1:${programPort}?pkt_size=1316`;
const publisherInputUrl = studioReceiveUrl(programOutputUrl);

function rendererFeed(slot: 0 | 1) {
	const port = feedPort + slot;
	return {
		input: studioReceiveUrl(
			`udp://${feedHost}:${port}?localaddr=127.0.0.1&reuse=1`,
		),
		output: `udp://${feedHost}:${port}?localaddr=127.0.0.1&pkt_size=1316`,
	};
}

function relayArgs(inputUrl: string) {
	return [
		"ffmpeg",
		"-nostdin",
		"-hide_banner",
		"-loglevel",
		"warning",
		"-i",
		inputUrl,
		"-map",
		"0:v",
		"-map",
		"0:a?",
		"-c",
		"copy",
		"-f",
		"mpegts",
		programOutputUrl,
	];
}

function xfadeArgs(oldInputUrl: string, nextInputUrl: string) {
	return [
		"ffmpeg",
		"-nostdin",
		"-hide_banner",
		"-loglevel",
		"warning",
		"-i",
		oldInputUrl,
		"-i",
		nextInputUrl,
		"-filter_complex",
		studioXfadeFilter(),
		"-map",
		"[video]",
		"-map",
		"[audio]",
		...studioVideoArgs(),
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-f",
		"mpegts",
		programOutputUrl,
	];
}

async function ensurePublisher() {
	await pipeline.startPublisher([
		"ffmpeg",
		"-nostdin",
		"-hide_banner",
		"-loglevel",
		"warning",
		"-fflags",
		"+genpts",
		"-i",
		publisherInputUrl,
		"-c:v",
		"copy",
		// AAC global headers must exist before RTSP writes its SDP.
		...STUDIO_AUDIO_PUBLISH_ARGS,
		"-f",
		"rtsp",
		programUrls.publishUrl,
	]);
}

/** Bounded wait for the renderer to emit its first frame. */
async function waitForRendererFrames(file: string) {
	for (let attempt = 0; attempt < 50; attempt++) {
		try {
			if (rendererProgressFrames(await readFile(file, "utf8")) > 0) return true;
		} catch {
			// ffmpeg has not created the progress file yet.
		}
		await Bun.sleep(100);
	}
	return false;
}

async function waitForProgramPublisher() {
	for (let attempt = 0; attempt < 20; attempt++) {
		if (compositorExited(pipeline.publisherExitCode)) return false;
		const probe = Bun.spawn(publisherProbeArgs(programUrls.publishUrl), {
			stdout: "ignore",
			stderr: "ignore",
		});
		const timeout = setTimeout(() => probe.kill(), 3000);
		const exitCode = await probe.exited;
		clearTimeout(timeout);
		if (exitCode === 0) return true;
		await Bun.sleep(250);
	}
	return false;
}

async function apply(desired: Desired, crossfade: boolean) {
	const scene = desired.graph.scenes.find(
		({ id }) => id === desired.graph.activeSceneId,
	);
	const layers = [...(scene?.layers ?? [])]
		.filter(
			(layer) =>
				layer.visible &&
				!layer.runtimeDisabled &&
				(layer.type !== "alert" ||
					(!!desired.alert &&
						studioAlertEvents(layer).includes(desired.alert.event))),
		)
		.sort((a, b) => a.zIndex - b.zIndex);
	const nextSlot: 0 | 1 = activeFeedSlot === 0 ? 1 : 0;
	const nextFeed = rendererFeed(nextSlot);
	const previousFeed =
		activeFeedSlot === undefined ? undefined : rendererFeed(activeFeedSlot);
	const progressFile = `${work}/renderer-${nextSlot}.progress`;
	await rm(progressFile, { force: true });
	const args = [
		"ffmpeg",
		"-nostdin",
		"-hide_banner",
		"-loglevel",
		"warning",
		"-progress",
		progressFile,
		"-rtsp_transport",
		"tcp",
		"-i",
		authenticatedInputUrl,
	];
	let current = "[0:v]";
	let inputs = 0;
	const filters: string[] = [];
	for (const layer of layers) {
		const output = `layer${layer.zIndex}`;
		if (layer.type === "alert") {
			const appearance = studioAlertAppearance(layer);
			let media: { file: string; animated: boolean } | undefined;
			if (layer.url && layer.assetId) {
				try {
					const response = await fetch(layer.url, {
						signal: AbortSignal.timeout(5_000),
					});
					if (!response.ok || !response.body)
						throw new Error("Alert image unavailable");
					const chunks: Uint8Array[] = [];
					let size = 0;
					for await (const chunk of response.body) {
						size += chunk.byteLength;
						if (size > 10 * 1024 * 1024)
							throw new Error("Alert image exceeds size limit");
						chunks.push(chunk);
					}
					const contentType = response.headers
						.get("content-type")
						?.split(";")[0]
						?.trim();
					// Upload finalization normalizes every verified asset to PNG or GIF.
					if (contentType !== "image/png" && contentType !== "image/gif")
						throw new Error("Unexpected alert image type");
					const animated = contentType === "image/gif";
					const file = `${work}/alert-media-${nextSlot}.${animated ? "gif" : "png"}`;
					await writeFile(file, Buffer.concat(chunks), { mode: 0o600 });
					media = { file, animated };
				} catch {
					console.warn("Alert image unavailable; showing text");
				}
			}
			try {
				const label = desired.alert?.label ?? "Alert";
				const render = {
					width: layer.width,
					height: layer.height,
					appearance,
					label,
					hasMedia: !!media,
				};
				const key = JSON.stringify(render);
				if (alertTextCache?.key !== key)
					alertTextCache = { key, bytes: await renderStudioAlertPng(render) };
				const file = `${work}/alert-text-${nextSlot}.png`;
				await writeFile(file, alertTextCache.bytes, { mode: 0o600 });
				args.push("-loop", "1", "-i", file);
				const textInput = ++inputs;
				let mediaInput: number | undefined;
				if (media) {
					args.push(
						...(media.animated
							? ["-stream_loop", "-1", "-ignore_loop", "1"]
							: ["-loop", "1"]),
						"-i",
						media.file,
					);
					mediaInput = ++inputs;
				}
				filters.push(
					...studioAlertFilters({
						...layer,
						appearance,
						base: current,
						output,
						textInput,
						mediaInput,
					}),
				);
				current = `[${output}]`;
				continue;
			} catch {
				console.warn("Styled alert unavailable; showing plain text");
			}
		}
		if (layer.type === "text" || layer.type === "alert") {
			const file = `${work}/${safeId(layer.id)}-${nextSlot}.txt`;
			await writeFile(
				file,
				layer.type === "alert"
					? (desired.alert?.label ?? "Alert")
					: (layer.text ?? ""),
				{ mode: 0o600 },
			);
			filters.push(
				`${current}drawtext=textfile='${file}':expansion=none:x=${Number(layer.x)}:y=${Number(layer.y)}:fontsize=${Math.max(12, Math.min(layer.height, 200))}:fontcolor=white:box=1:boxcolor=black@0.45[${output}]`,
			);
			current = `[${output}]`;
			continue;
		}
		try {
			const source =
				layer.type === "browser" ? await browserPng(layer) : layer.url;
			if (!source) throw new Error("asset unavailable");
			// Only live browser files need reopening. Reopening a remote PNG
			// would download the static asset again for every frame.
			args.push(
				...(layer.type === "browser"
					? studioImageArgs(source)
					: ["-loop", "1", "-i", source]),
			);
			filters.push(
				`[${++inputs}:v]scale=${layer.width}:${layer.height}[${output}source]`,
			);
			filters.push(
				`${current}[${output}source]overlay=${layer.x}:${layer.y}[${output}]`,
			);
			current = `[${output}]`;
		} catch (error) {
			if (layer.type === "browser") {
				const response = await hook("browser-failure", {
					path,
					layerId: layer.id,
				});
				if (!response.ok) throw new Error("browser failure was not recorded");
				continue;
			}
			throw error;
		}
	}
	if (filters.length)
		args.push("-filter_complex", filters.join(";"), "-map", current);
	else args.push("-map", "0:v");
	args.push(
		"-map",
		"0:a?",
		...studioVideoArgs(),
		"-c:a",
		"aac",
		"-b:a",
		"192k",
		"-ac",
		"2",
		"-ar",
		"48000",
		"-f",
		"mpegts",
		nextFeed.output,
	);
	await pipeline.applyRenderer({
		rendererArgs: args,
		relayArgs: relayArgs(nextFeed.input),
		rendererReady: () => waitForRendererFrames(progressFile),
		...(crossfade && previousFeed
			? {
					transitionArgs: xfadeArgs(previousFeed.input, nextFeed.input),
					transitionMs: 500,
				}
			: {}),
	});
	activeFeedSlot = nextSlot;
}

// Rendering browser layers can exceed the five-second heartbeat window.
let healthPending = false;
const healthTimer = setInterval(() => {
	if (!applied || healthPending) return;
	const healthy = compositorHasPublisher(
		"program",
		pipeline.publisherExitCode,
		pipeline.rendererExitCode,
		pipeline.outputExitCode,
	);
	healthPending = true;
	void hook("health", {
		path,
		healthy,
		...(healthy ? { programUrl: programUrls.readUrl } : {}),
	})
		.catch(() => undefined)
		.finally(() => {
			healthPending = false;
		});
}, 1000);

try {
	while (true) {
		try {
			if (compositorExited(pipeline.publisherExitCode)) {
				await pipeline.stop();
				applied = "";
				appliedSceneId = undefined;
				activeFeedSlot = undefined;
				await hook("health", { path, healthy: false });
			} else if (
				compositorExited(pipeline.rendererExitCode) ||
				compositorExited(pipeline.outputExitCode)
			) {
				applied = "";
				await hook("health", { path, healthy: false });
			}
			const response = await hook("desired-state", { path });
			if (!response.ok) throw new Error("desired state unavailable");
			const desired = (await response.json()) as Desired;
			requestedMode = desired.requestedMode;
			const revision = `${desired.version}:${desired.graph.activeSceneId}:${desired.alert?.at ?? ""}`;
			const activeScene = desired.graph.scenes.find(
				({ id }) => id === desired.graph.activeSceneId,
			);
			const browserLayers =
				activeScene?.layers.filter(
					({ type, visible }) => type === "browser" && visible,
				) ?? [];
			const refreshBrowser = browserRefreshDue(
				browserLayers.length > 0,
				browserLayers.every(({ runtimeDisabled }) => runtimeDisabled === true),
				lastBrowserRefresh,
				Date.now(),
			);
			if (desired.requestedMode === "program" && revision !== applied) {
				await ensurePublisher();
				await apply(
					desired,
					shouldCrossfadeScenes(
						appliedSceneId,
						desired.graph.activeSceneId,
						activeScene?.transition ?? "cut",
					),
				);
				if (!(await waitForProgramPublisher()))
					throw new Error("program publisher did not become readable");
				applied = revision;
				appliedSceneId = desired.graph.activeSceneId ?? undefined;
				if (browserLayers.length) lastBrowserRefresh = Date.now();
			} else if (desired.requestedMode === "program" && refreshBrowser) {
				for (const layer of browserLayers.filter(
					(layer) => !layer.runtimeDisabled,
				)) {
					try {
						await browserPng(layer);
					} catch {
						const response = await hook("browser-failure", {
							path,
							layerId: layer.id,
						});
						if (!response.ok)
							throw new Error("browser failure was not recorded");
						applied = "";
					}
				}
				lastBrowserRefresh = Date.now();
			} else if (
				desired.requestedMode === "passthrough" &&
				pipeline.publisherPid
			) {
				await pipeline.stop();
				applied = "";
				appliedSceneId = undefined;
				activeFeedSlot = undefined;
			}
			await retainBrowsers(
				new Set(
					desired.requestedMode === "program"
						? browserLayers
								.filter((layer) => !layer.runtimeDisabled)
								.map((layer) => layer.id)
						: [],
				),
			);
			const healthy = compositorHasPublisher(
				desired.requestedMode,
				pipeline.publisherExitCode,
				pipeline.rendererExitCode,
				pipeline.outputExitCode,
			);
			await hook("health", {
				path,
				healthy,
				...(healthy ? { programUrl: programUrls.readUrl } : {}),
			});
		} catch {
			// A failed re-apply is not proof the program stopped. Report what the
			// processes actually say, so one bad save cannot drop a still-running
			// program into camera-only fallback.
			const healthy = compositorHasPublisher(
				requestedMode,
				pipeline.publisherExitCode,
				pipeline.rendererExitCode,
				pipeline.outputExitCode,
			);
			await hook("health", {
				path,
				healthy,
				...(healthy ? { programUrl: programUrls.readUrl } : {}),
			}).catch(() => undefined);
		}
		await Bun.sleep(1_000);
	}
} finally {
	clearInterval(healthTimer);
	await retainBrowsers(new Set());
	await pipeline.stop();
	await rm(work, { recursive: true, force: true });
}
