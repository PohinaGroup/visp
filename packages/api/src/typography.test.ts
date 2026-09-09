import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import "./test-env";

const { captionFilter } = await import("./typography");
const hasDrawtext = spawnSync("ffmpeg", ["-hide_banner", "-filters"])
	.stdout?.toString().includes(" drawtext ") ?? false;

describe("captionFilter", () => {
	test("keeps a phrase on its source-word time range and escapes filter text", () => {
		const result = captionFilter({
			version: 1,
			style: "TikTok Basic",
			intensity: 50,
			hook: "",
			captionY: 62,
			words: [
				{ id: "1", text: "we're", start: 1.2, end: 1.5, emphasis: 0, group: 0 },
				{ id: "2", text: "ready", start: 1.6, end: 2, emphasis: 0, group: 0 },
			],
		});

		expect(result).toContain("between(t,1.2,2)");
	});

	test.skipIf(!hasDrawtext)("renders punctuation literally through FFmpeg", () => {
		const directory = mkdtempSync(join(tmpdir(), "typography-test-"));
		const textFile = join(directory, "caption.txt");
		const render = (filter: string) => {
			const result = spawnSync("ffmpeg", [
				"-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
				"color=s=640x360:d=0.1", "-vf", filter, "-frames:v", "1",
				"-f", "rawvideo", "-",
			], { maxBuffer: 2 * 1024 * 1024 });
			expect(result.error).toBeUndefined();
			expect(result.stderr.toString()).toBe("");
			expect(result.status).toBe(0);
			return result.stdout;
		};
		try {
			for (const text of ["isn't", "it's: 50%, [yes]; \\ %{n}"]) {
				writeFileSync(textFile, text.toUpperCase());
				const filter = captionFilter({
					version: 1, style: "TikTok Basic", intensity: 50, hook: "", captionY: 62,
					words: [{ id: "1", text, start: 0, end: 1, emphasis: 0, group: 0 }],
				});
				expect(render(filter)).toEqual(render(
					`drawtext=fontcolor=white:fontsize=64:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.62:expansion=none:textfile=${textFile}:enable='between(t,0,1)'`,
				));
			}
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	});
});
