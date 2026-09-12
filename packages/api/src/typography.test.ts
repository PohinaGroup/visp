import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { captionSubtitles } from "./typography-captions";
import type { TypographyDocument } from "./typography";

const document: TypographyDocument = {
	version: 1,
	style: "Hormozi",
	intensity: 50,
	hook: "WATCH THIS",
	captionY: 40,
	words: [
		{ id: "1", text: "big", start: 0, end: 0.4, emphasis: 1, group: 0 },
		{ id: "2", text: "idea", start: 0.5, end: 1, emphasis: 0, group: 0 },
	],
};

test("export honors caption design and preserves word timing", () => {
	const output = captionSubtitles(document);
	expect(output).toContain("Barlow Condensed,120");
	expect(output).toContain(String.raw`\pos(540,768)`);
	expect(output).toContain(String.raw`\fs134\1c&H4EDBEC&}BIG`);
	expect(output).toContain("WATCH THIS");
	expect(output).toContain("0:00:00.00,0:00:00.50");
	expect(output).toContain("0:00:00.50,0:00:01.00");
	const minimal = captionSubtitles({ ...document, style: "Minimal", hook: "" });
	expect(minimal).toContain("Barlow,60");
	expect(minimal).toContain("}big");
	expect(minimal).not.toContain("WATCH THIS");
	expect(minimal).not.toEqual(output);
	const karaoke = captionSubtitles({ ...document, style: "Karaoke" });
	expect(karaoke).toContain(String.raw`\fs120\1c&H4EDBEC&}IDEA`);
	const hostile = captionSubtitles({
		...document,
		hook: String.raw`{\pos(0,0)}\N`,
	});
	expect(hostile).not.toContain(String.raw`{\pos(0,0)}\N`);
});

const hasAss =
	spawnSync("ffmpeg", ["-hide_banner", "-filters"])
		.stdout?.toString()
		.includes(" ass ") ?? false;
test.skipIf(!hasAss)(
	"FFmpeg renders emphasis, style, and position into actual pixels",
	() => {
		const directory = mkdtempSync(join(tmpdir(), "typography-render-test-"));
		const fonts =
			process.env.TYPOGRAPHY_TEST_FONTS ??
			resolve(import.meta.dir, "../../../apps/typography/dist/assets");
		const render = (input: TypographyDocument) => {
			const path = join(directory, "captions.ass");
			writeFileSync(path, captionSubtitles(input));
			const result = spawnSync(
				"ffmpeg",
				[
					"-hide_banner",
					"-loglevel",
					"error",
					"-f",
					"lavfi",
					"-i",
					"color=s=540x960:d=1",
					"-vf",
					`ass=filename=${path}:fontsdir=${fonts}`,
					"-frames:v",
					"1",
					"-pix_fmt",
					"rgb24",
					"-f",
					"rawvideo",
					"-",
				],
				{ maxBuffer: 4 * 1024 * 1024 },
			);
			expect(result.status).toBe(0);
			expect(result.stderr.toString()).toBe("");
			return result.stdout;
		};
		try {
			const styled = render(document);
			let yellow = 0;
			for (let i = 0; i < styled.length; i += 3) {
				if (styled[i]! > 150 && styled[i + 1]! > 150 && styled[i + 2]! < 130)
					yellow++;
			}
			expect(yellow).toBeGreaterThan(100);
			expect(render({ ...document, style: "Minimal" })).not.toEqual(styled);
			expect(render({ ...document, captionY: 80 })).not.toEqual(styled);
			expect(render({ ...document, hook: "" })).not.toEqual(styled);
		} finally {
			rmSync(directory, { recursive: true, force: true });
		}
	},
);
