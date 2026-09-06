import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "../../packages/api/node_modules/sharp";
import { DEFAULT_ALERT_APPEARANCE } from "../../packages/api/src/studio-alert";
import { renderStudioAlertPng, studioAlertFilters } from "./alert";

// Run with CHROMIUM_BIN=/path/to/chromium bun deploy/compositor/alert.check.ts
{
	const work = await mkdtemp(join(tmpdir(), "visp-alert-check-"));
	try {
		const appearance = {
			...DEFAULT_ALERT_APPEARANCE,
			layout: "beside" as const,
			fontSize: 24,
			imageSize: 40,
		};
		const png = await renderStudioAlertPng({
			width: 320,
			height: 180,
			appearance,
			label: "LongViewerNameÄÖ followed!",
			hasMedia: true,
		});
		const text = await sharp(png)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		assert.equal(text.data[3], 0);
		assert(text.data.some((value, index) => index % 4 === 3 && value > 0));
		await writeFile(join(work, "text.png"), png);
		const pixels = Buffer.alloc(16 * 16 * 4 * 2);
		for (let i = 0; i < pixels.length; i += 4) {
			// Leave the left half transparent; the right half changes red to green.
			if ((i / 4) % 16 < 8) continue;
			pixels[i < pixels.length / 2 ? i : i + 1] = 255;
			pixels[i + 3] = 255;
		}
		const gif = await sharp(pixels, {
			raw: { width: 16, height: 32, channels: 4, pageHeight: 16 },
		})
			.gif({ delay: [200, 200], loop: 0 })
			.toBuffer();
		await writeFile(join(work, "media.gif"), gif);
		const filters = studioAlertFilters({
			base: "[0:v]",
			output: "alert",
			textInput: 1,
			mediaInput: 2,
			x: 0,
			y: 0,
			width: 320,
			height: 180,
			appearance,
		});
		const args = [
			"ffmpeg",
			"-v",
			"error",
			"-f",
			"lavfi",
			"-i",
			"color=blue:s=320x180:r=10",
			"-loop",
			"1",
			"-i",
			join(work, "text.png"),
			"-stream_loop",
			"-1",
			"-ignore_loop",
			"1",
			"-i",
			join(work, "media.gif"),
			"-filter_complex",
			filters.join(";"),
			"-map",
			"[alert]",
			"-t",
			"1",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"pipe:1",
		];
		const proc = Bun.spawnSync(args, {
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			timeout: 10000,
		});
		const [frames, error, code] = [
			proc.stdout,
			proc.stderr.toString(),
			proc.exitCode,
		];
		assert.equal(error, "");
		assert.equal(code, 0);
		const bytes = new Uint8Array(frames);
		const pixel = (frame: number, x: number, y: number) => [
			...bytes.slice(
				(frame * 320 * 180 + y * 320 + x) * 3,
				(frame * 320 * 180 + y * 320 + x) * 3 + 3,
			),
		];
		assert((pixel(0, 100, 90)[0] ?? 0) > 240, "first GIF frame is red");
		assert((pixel(3, 100, 90)[1] ?? 0) > 240, "second GIF frame is green");
		assert((pixel(5, 100, 90)[0] ?? 0) > 240, "GIF loops back to red");
		assert(
			(pixel(0, 20, 90)[2] ?? 0) > 240,
			"transparent pixels preserve the blue stream",
		);
		await sharp(bytes.slice(0, 320 * 180 * 3), {
			raw: { width: 320, height: 180, channels: 3 },
		})
			.png()
			.toFile("/tmp/visp-alert-render.png");
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}
