import { expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CompositorPipeline } from "./pipeline";

async function waitForFileContent(
	path: string,
	ready: (content: string) => boolean,
	description: string,
	timeoutMs = 3_000,
) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await Bun.file(path).exists()) {
			const content = await readFile(path, "utf8");
			if (ready(content)) return content;
		}
		await Bun.sleep(20);
	}
	throw new Error(`Timed out waiting for ${description}`);
}

test("keeps the publisher stable and crossfades only scene fade changes", async () => {
	const work = await mkdtemp(join(tmpdir(), "visp-pipeline-"));
	const fakeFfmpeg = join(work, "ffmpeg");
	const frames = join(work, "frames");
	const outputActive = join(work, "output-active");
	const log = join(work, "processes");
	await writeFile(
		fakeFfmpeg,
		`#!/usr/bin/env bash
role="$1"
printf 'start %s %s\\n' "$role" "$$" >>"${log}"
if test "$role" = publisher; then
	while true; do
		test ! -f "${outputActive}" || printf '.\\n' >>"${frames}"
		sleep 0.02
	done
fi
case "$role" in relay-*|xfade) touch "${outputActive}" ;; esac
trap 'printf "stop %s %s\\n" "$role" "$$" >>"${log}"; case "$role" in relay-*|xfade) rm -f "${outputActive}" ;; esac; exit 0' INT TERM EXIT
while true; do sleep 0.02; done
`,
	);
	await chmod(fakeFfmpeg, 0o755);
	const pipeline = new CompositorPipeline();
	const args = (role: string) => [fakeFfmpeg, role];
	try {
		await pipeline.startPublisher(args("publisher"));
		const publisherPid = pipeline.publisherPid;
		await pipeline.applyRenderer({
			rendererArgs: args("renderer-scene-a"),
			relayArgs: args("relay-scene-a"),
		});
		const before = (
			await waitForFileContent(
				frames,
				(content) => content.length > 0,
				"the stable publisher's first program frame",
			)
		).length;

		await pipeline.applyRenderer({
			rendererArgs: args("renderer-browser-refresh"),
			relayArgs: args("relay-browser-refresh"),
		});
		await pipeline.applyRenderer({
			rendererArgs: args("renderer-cut-scene"),
			relayArgs: args("relay-cut-scene"),
		});
		let processes = await waitForFileContent(
			log,
			(content) => content.includes("start relay-cut-scene"),
			"the cut relay",
		);
		expect(processes).not.toContain("start xfade");

		const fading = pipeline.applyRenderer({
			rendererArgs: args("renderer-fade-scene"),
			relayArgs: args("relay-fade-scene"),
			transitionArgs: args("xfade"),
			transitionMs: 120,
		});
		processes = await waitForFileContent(
			log,
			(content) => content.includes("start xfade"),
			"the fade transition process",
		);
		expect(processes).toContain("start renderer-fade-scene");
		expect(processes).toContain("start xfade");
		expect(processes).not.toContain("stop renderer-cut-scene");
		await fading;
		processes = await waitForFileContent(
			log,
			(content) => content.includes("stop renderer-cut-scene"),
			"the old renderer to retire after xfade",
		);
		expect(processes).toContain("stop renderer-cut-scene");
		expect(pipeline.publisherPid).toBe(publisherPid);
		expect(pipeline.publisherRunning).toBe(true);
		const after = await waitForFileContent(
			frames,
			(content) => content.length > before,
			"program frames after the scene transition",
		);
		expect(after.length).toBeGreaterThan(before);
	} finally {
		await pipeline.stop();
		await rm(work, { recursive: true, force: true });
	}
});
