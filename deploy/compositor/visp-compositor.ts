#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { StudioAlertAppearance } from "../../packages/api/src/studio-alert";
import {
	studioAlertAppearance,
	studioAlertEvents,
} from "../../packages/api/src/studio-alert";
import {
	isPublicAddress,
	validateBrowserSourceUrl,
} from "../../packages/api/src/studio-browser-url";
import { renderStudioAlertPng, studioAlertFilters } from "./alert";
import { validateBrowserRequest } from "./browser-security";
import { CompositorPipeline } from "./pipeline";
import {
	authenticatedProgramUrls,
	authenticatedRtspUrl,
	browserRefreshDue,
	compositorExited,
	compositorHasPublisher,
	publisherProbeArgs,
	rendererProgressFrames,
	shouldCrossfadeScenes,
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

async function browserPng(layer: Layer) {
	const url = new URL(validateBrowserSourceUrl(layer.url ?? ""));
	const addresses = await lookup(url.hostname, { all: true, verbatim: true });
	if (
		!addresses.length ||
		addresses.some(({ address }) => !isPublicAddress(address))
	)
		throw new Error("browser hostname did not resolve publicly");
	const id = safeId(layer.id);
	const file = `${work}/${id}.png`;
	const profile = `${work}/chrome-${id}`;
	await rm(profile, { recursive: true, force: true });
	await mkdir(profile, { mode: 0o700 });
	const chrome = Bun.spawn(
		[
			process.env.CHROMIUM_BIN ?? "chromium",
			"--headless",
			"--disable-background-networking",
			"--disable-extensions",
			"--disable-sync",
			"--enable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests",
			`--host-resolver-rules=MAP ${url.hostname} ${addresses[0]?.address}, MAP * ~NOTFOUND`,
			"--remote-debugging-port=0",
			`--user-data-dir=${profile}`,
			"about:blank",
		],
		{ stdout: "ignore", stderr: "ignore" },
	);
	try {
		let port = "";
		for (let attempt = 0; attempt < 40; attempt++) {
			try {
				port =
					(await readFile(`${profile}/DevToolsActivePort`, "utf8")).split(
						"\n",
					)[0] ?? "";
				if (port) break;
			} catch {}
			await Bun.sleep(50);
		}
		if (!port) throw new Error("browser debugging endpoint unavailable");
		const targetResponse = await fetch(
			`http://127.0.0.1:${port}/json/new?about:blank`,
			{ method: "PUT" },
		);
		if (!targetResponse.ok) throw new Error("browser target unavailable");
		const target = (await targetResponse.json()) as {
			webSocketDebuggerUrl: string;
		};
		const socket = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise<void>((resolve, reject) => {
			socket.addEventListener("open", () => resolve(), { once: true });
			socket.addEventListener(
				"error",
				() => reject(new Error("browser CDP unavailable")),
				{ once: true },
			);
		});
		let commandId = 0;
		const pending = new Map<
			number,
			{
				resolve: (value: unknown) => void;
				reject: (error: Error) => void;
				timer: ReturnType<typeof setTimeout>;
			}
		>();
		let blocked: Error | undefined;
		const command = (method: string, params: object = {}) =>
			new Promise<unknown>((resolve, reject) => {
				const id = ++commandId;
				const timer = setTimeout(() => {
					pending.delete(id);
					reject(new Error(`browser CDP command timed out: ${method}`));
				}, 5_000);
				pending.set(id, { resolve, reject, timer });
				socket.send(JSON.stringify({ id, method, params }));
			});
		const rejectPending = () => {
			for (const { reject, timer } of pending.values()) {
				clearTimeout(timer);
				reject(new Error("browser CDP disconnected"));
			}
			pending.clear();
		};
		socket.addEventListener("error", rejectPending);
		socket.addEventListener("close", rejectPending);
		socket.addEventListener("message", (message) => {
			const payload = JSON.parse(String(message.data)) as {
				id?: number;
				method?: string;
				params?: { requestId: string; request: { url: string } };
				result?: unknown;
			};
			if (payload.id) {
				const command = pending.get(payload.id);
				if (command) {
					clearTimeout(command.timer);
					command.resolve(payload.result);
				}
				pending.delete(payload.id);
			}
			if (payload.method === "Fetch.requestPaused" && payload.params) {
				const { requestId, request } = payload.params;
				void validateBrowserRequest(request.url, url.hostname)
					.then(() => command("Fetch.continueRequest", { requestId }))
					.catch((error) => {
						blocked =
							error instanceof Error
								? error
								: new Error("browser request blocked");
						return command("Fetch.failRequest", {
							requestId,
							errorReason: "BlockedByClient",
						});
					});
			}
		});
		await command("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
		await command("Page.enable");
		await command("Emulation.setDeviceMetricsOverride", {
			width: layer.width,
			height: layer.height,
			deviceScaleFactor: 1,
			mobile: false,
		});
		await command("Page.navigate", { url: url.toString() });
		await Bun.sleep(1_500);
		if (blocked) throw blocked;
		const capture = (await command("Page.captureScreenshot", {
			format: "png",
		})) as { data?: string };
		if (!capture.data) throw new Error("browser capture unavailable");
		await writeFile(file, Buffer.from(capture.data, "base64"), { mode: 0o600 });
		socket.close();
		return file;
	} finally {
		chrome.kill();
		await chrome.exited;
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
const publisherInputUrl = `${programOutputUrl}&fifo_size=1000000&overrun_nonfatal=1`;

function rendererFeed(slot: 0 | 1) {
	const port = feedPort + slot;
	return {
		input: `udp://${feedHost}:${port}?localaddr=127.0.0.1&reuse=1&fifo_size=1000000&overrun_nonfatal=1`,
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
		"-c:v",
		process.env.STUDIO_VIDEO_ENCODER ?? "libx264",
		"-preset",
		"veryfast",
		"-bf",
		"0",
		"-c:a",
		"aac",
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
		// RTSP needs AAC global headers; the MPEG-TS input carries ADTS audio.
		"-c:a",
		"aac",
		"-flags:a",
		"+global_header",
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
			args.push("-loop", "1", "-i", source);
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
		"-c:v",
		process.env.STUDIO_VIDEO_ENCODER ?? "libx264",
		"-preset",
		"veryfast",
		"-bf",
		"0",
		"-pix_fmt",
		"yuv420p",
		"-r",
		process.env.STUDIO_FPS ?? "30",
		"-g",
		process.env.STUDIO_GOP ?? "60",
		"-c:a",
		"aac",
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
	}).catch(() => undefined).finally(() => { healthPending = false; });
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
			if (
				desired.requestedMode === "program" &&
				(revision !== applied || refreshBrowser)
			) {
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
			} else if (
				desired.requestedMode === "passthrough" &&
				pipeline.publisherPid
			) {
				await pipeline.stop();
				applied = "";
				appliedSceneId = undefined;
				activeFeedSlot = undefined;
			}
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
	await pipeline.stop();
	await rm(work, { recursive: true, force: true });
}
