import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "../../packages/api/node_modules/sharp";
import { openBrowser } from "./browser";
import { studioImageArgs } from "./state";

// CHROMIUM_BIN=/path/to/chromium bun deploy/compositor/browser.check.ts
const work = await mkdtemp(join(tmpdir(), "visp-browser-check-"));
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
let encoder: ReturnType<typeof Bun.spawn> | undefined;
let socket: WebSocket | undefined;
try {
	browser = await openBrowser(work, {
		id: "widget",
		url: "https://example.com",
		width: 320,
		height: 180,
	});
	const [port] = (
		await readFile(join(work, "chrome-widget/DevToolsActivePort"), "utf8")
	).split("\n");
	const targets = (await (
		await fetch(`http://127.0.0.1:${port}/json/list`)
	).json()) as { type: string; webSocketDebuggerUrl: string }[];
	const target = targets.find((target) => target.type === "page");
	assert(target);
	const cdp = new WebSocket(target.webSocketDebuggerUrl);
	socket = cdp;
	await new Promise<void>((resolve, reject) => {
		cdp.onopen = () => resolve();
		cdp.onerror = reject;
	});
	let id = 0;
	async function color(value: string) {
		const commandId = ++id;
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("CDP timeout")), 5000);
			cdp.onmessage = (event) => {
				const result = JSON.parse(String(event.data));
				if (result.id !== commandId) return;
				clearTimeout(timer);
				if (result.error) reject(new Error(result.error.message));
				else resolve();
			};
			cdp.send(
				JSON.stringify({
					id: commandId,
					method: "Runtime.evaluate",
					params: {
						expression: `document.documentElement.innerHTML = '<body style="margin:0;background:${value}"></body>'`,
					},
				}),
			);
		});
		await Bun.sleep(100);
	}
	await color("red");
	const file = await browser.capture();
	const red = await sharp(file).raw().toBuffer();
	assert(
		red.readUInt8(0) > 200 && red.readUInt8(2) < 50,
		"first browser frame is red",
	);
	const output = join(work, "frames.rgb");
	encoder = Bun.spawn(
		[
			"ffmpeg",
			"-v",
			"error",
			"-re",
			...studioImageArgs(file, "10"),
			"-t",
			"4",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			output,
		],
		{ stdout: "ignore", stderr: "inherit" },
	);
	await Bun.sleep(1500);
	await color("blue");
	assert.equal(
		await browser.capture(),
		file,
		"refresh updates the same image input",
	);
	const blue = await sharp(file).raw().toBuffer();
	assert(
		blue.readUInt8(2) > 200 && blue.readUInt8(0) < 50,
		"second browser frame is blue",
	);
	assert.equal(
		encoder.exitCode,
		null,
		"the encoder is still running during refresh",
	);
	assert.equal(await encoder.exited, 0);
	const frames = await readFile(output);
	const frameSize = 320 * 180 * 3;
	const pixels = Array.from({ length: frames.length / frameSize }, (_, i) =>
		frames.subarray(i * frameSize, i * frameSize + 3),
	);
	assert(pixels.some((p) => p.readUInt8(0) > 200 && p.readUInt8(2) < 50));
	assert(
		pixels.some((p) => p.readUInt8(2) > 200 && p.readUInt8(0) < 50),
		"FFmpeg reads updated pixels without restarting",
	);
	assert.equal(
		(
			await readFile(join(work, "chrome-widget/DevToolsActivePort"), "utf8")
		).split("\n")[0],
		port,
	);
	console.log(
		"ok: persistent browser refresh reaches a running FFmpeg input without restarting either process",
	);
} finally {
	socket?.close();
	encoder?.kill();
	await encoder?.exited;
	await browser?.close();
	await rm(work, { recursive: true, force: true });
}
