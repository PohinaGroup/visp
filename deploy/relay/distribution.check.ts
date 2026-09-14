import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	STUDIO_AUDIO_PUBLISH_ARGS,
	studioVideoArgs,
} from "../compositor/state";

// bun deploy/relay/distribution.check.ts
// Requires Docker and FFmpeg. Uses an isolated MediaMTX with loopback ports.
const work = await mkdtemp(join(tmpdir(), "visp-distribution-"));
const name = `visp-distribution-check-${process.pid}`;
const rtspPort = 28554;
const apiPort = 29997;
const processes: ReturnType<typeof Bun.spawn>[] = [];
const app = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch: () => new Response("ok"),
});
const rtsp = `rtsp://127.0.0.1:${rtspPort}`;
const api = `http://127.0.0.1:${apiPort}/v3`;
async function run(args: string[], env?: Record<string, string>) {
	const p = Bun.spawn(args, {
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [out, err, code] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
		p.exited,
	]);
	assert.equal(code, 0, err);
	return out.trim();
}
function spawn(args: string[]) {
	const p = Bun.spawn(args, { stdout: "ignore", stderr: "inherit" });
	processes.push(p);
	return p;
}
async function until(check: () => Promise<boolean>, description: string) {
	for (let i = 0; i < 120; i++) {
		if (await check()) return;
		await Bun.sleep(250);
	}
	throw new Error(`Timed out: ${description}`);
}
async function ready(path: string) {
	try {
		const r = await fetch(`${api}/paths/get/${path}`);
		return r.ok && ((await r.json()) as { ready: boolean }).ready;
	} catch {
		return false;
	}
}
try {
	await writeFile(
		join(work, "mediamtx.yml"),
		`
logLevel: error
api: true
apiAddress: :${apiPort}
rtspAddress: :${rtspPort}
rtspTransports: [tcp]
rtmp: false
hls: false
webrtc: false
srt: false
moq: false
authInternalUsers:
  - user: any
    permissions:
      - action: publish
      - action: read
      - action: api
paths:
  all_others:
`,
	);
	await run([
		"docker",
		"run",
		"--rm",
		"-d",
		"--name",
		name,
		"-p",
		`127.0.0.1:${rtspPort}:${rtspPort}`,
		"-p",
		`127.0.0.1:${apiPort}:${apiPort}`,
		"-v",
		`${work}:/check`,
		"bluenviron/mediamtx:1-ffmpeg",
		"/check/mediamtx.yml",
	]);
	await until(async () => {
		try {
			return (await fetch(`${api}/paths/list`)).ok;
		} catch {
			return false;
		}
	}, "MediaMTX startup");
	spawn([
		"ffmpeg",
		"-v",
		"error",
		"-re",
		"-f",
		"lavfi",
		"-i",
		"testsrc2=size=320x180:rate=30",
		"-f",
		"lavfi",
		"-i",
		"sine=frequency=440:sample_rate=48000",
		"-c:v",
		"libx264",
		"-preset",
		"ultrafast",
		"-tune",
		"zerolatency",
		"-g",
		"30",
		"-c:a",
		"aac",
		"-f",
		"rtsp",
		"-rtsp_transport",
		"tcp",
		`${rtsp}/input`,
	]);
	await until(() => ready("input"), "source frames");
	const source = await readFile(
		new URL("./visp-snapshot", import.meta.url),
		"utf8",
	);
	const functions = source.slice(
		source.indexOf("encode_command() {"),
		source.indexOf("cleanup_forward() {"),
	);
	const env = {
		app_url: app.url.origin,
		relay_api: `${api}/config/paths`,
		run_dir: work,
		safe_path: "input",
		studio_media_user_url: "studio-input",
		studio_media_user: "studio-input",
		studio_media_password: "test",
		RTSP_PORT: String(rtspPort),
		video_encoder: "libx264",
		video_bitrate_kbps: "1000",
		video_fps: "30",
		SOURCE: `${rtsp}/input`,
	};
	const command = [
		"bash",
		"-c",
		`${functions}\ndistribution_source "$SOURCE" landscape -`,
	];
	const [first, second] = await Promise.all([
		run(command, env),
		run(command, env),
	]);
	assert.equal(first, second, "identical outputs must share a rendition");
	const rendition = new URL(first).pathname.slice(1);
	const readerArgs = [
		"ffmpeg",
		"-v",
		"error",
		"-rtsp_transport",
		"tcp",
		"-i",
		first,
		"-c",
		"copy",
		"-f",
		"null",
		"-",
	];
	const a = spawn(readerArgs);
	const b = spawn(readerArgs);
	await until(() => ready(rendition), "shared encode ready");
	const streams = JSON.parse(
		await run([
			"ffprobe",
			"-v",
			"error",
			"-rtsp_transport",
			"tcp",
			"-i",
			first,
			"-show_entries",
			"stream=codec_name,channels,sample_rate",
			"-of",
			"json",
		]),
	).streams;
	assert(streams.some((s: { codec_name: string }) => s.codec_name === "h264"));
	assert(
		streams.some(
			(s: { codec_name: string; channels: number; sample_rate: string }) =>
				s.codec_name === "aac" && s.channels === 2 && s.sample_rate === "48000",
		),
	);
	const countEncoders = async () =>
		(await run(["docker", "top", name, "-eo", "pid,args"]))
			.split("\n")
			.filter((line) => line.includes("ffmpeg -nostdin")).length;
	assert.equal(await countEncoders(), 1);
	a.kill();
	await a.exited;
	await Bun.sleep(6000);
	assert.equal(
		b.exitCode,
		null,
		"one destination stopping must not stop another",
	);
	assert(await ready(rendition));
	b.kill();
	await b.exited;
	await until(
		async () => (await countEncoders()) === 0,
		"last reader stops the shared encoder",
	);
	// A retry reuses the config and starts one fresh encoder.
	const retry = spawn(readerArgs);
	await until(() => ready(rendition), "destination retry");
	assert.equal(await countEncoders(), 1);
	retry.kill();
	await retry.exited;

	const portrait = await run(
		[
			"bash",
			"-c",
			`${functions}\ndistribution_source "$SOURCE" portrait 'crop=iw*0.5:ih:0:0,scale=90:180'`,
		],
		env,
	);
	assert.notEqual(
		portrait,
		first,
		"different framing needs a separate rendition",
	);
	const dimensions = JSON.parse(
		await run([
			"ffprobe",
			"-v",
			"error",
			"-rtsp_transport",
			"tcp",
			"-i",
			portrait,
			"-select_streams",
			"v:0",
			"-show_entries",
			"stream=width,height",
			"-of",
			"json",
		]),
	).streams[0];
	assert.deepEqual(dimensions, { width: 90, height: 180 });
	const cleanup = source.slice(
		source.indexOf("cleanup_distribution() {"),
		source.indexOf("# The optional template"),
	);
	await run(["bash", "-c", `${cleanup}\ncleanup_distribution`], env);
	assert.equal(
		(await fetch(`${api}/config/paths/get/${rendition}`)).status,
		404,
	);
	console.log(
		"ok: one distribution encode, independent readers, idle shutdown, retry, H264/stereo AAC",
	);

	// Verify Studio quality settings and its required AAC header conversion.
	const ts = join(work, "studio.ts");
	await run([
		"ffmpeg",
		"-v",
		"error",
		"-f",
		"lavfi",
		"-i",
		"testsrc2=size=320x180:rate=30",
		"-f",
		"lavfi",
		"-i",
		"sine=sample_rate=48000",
		"-t",
		"3",
		...studioVideoArgs(),
		"-c:a",
		"aac",
		"-ac",
		"2",
		"-f",
		"mpegts",
		ts,
	]);
	const publisher = spawn([
		"ffmpeg",
		"-v",
		"error",
		"-re",
		"-stream_loop",
		"-1",
		"-i",
		ts,
		"-c:v",
		"copy",
		...STUDIO_AUDIO_PUBLISH_ARGS,
		"-f",
		"rtsp",
		"-rtsp_transport",
		"tcp",
		`${rtsp}/studio`,
	]);
	await until(() => ready("studio"), "Studio remux ready");
	await run([
		"ffmpeg",
		"-v",
		"error",
		"-rtsp_transport",
		"tcp",
		"-i",
		`${rtsp}/studio`,
		"-t",
		"1",
		"-f",
		"null",
		"-",
	]);
	assert.equal(publisher.exitCode, null);
	console.log("ok: Studio video and AAC decode after RTSP publication");
} catch (error) {
	console.error(await run(["docker", "logs", name]).catch(() => ""));
	throw error;
} finally {
	for (const p of processes) p.kill();
	await Promise.all(processes.map((p) => p.exited));
	app.stop(true);
	await run(["docker", "rm", "-f", name]).catch(() => undefined);
	await rm(work, { recursive: true, force: true });
}
