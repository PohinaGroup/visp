import { expect, test } from "bun:test";
import sharp from "sharp";
import {
	DEFAULT_ALERT_APPEARANCE,
	studioAlertAppearanceSchema,
	studioAlertEvents,
	studioAlertHtml,
	studioAlertLayout,
} from "./studio-alert";
import { validateStudioMedia } from "./studio-media";

test("bounds alert settings, keeps legacy event rules, and escapes viewer text", () => {
	expect(studioAlertEvents({ event: "sub" })).toEqual(["sub"]);
	expect(
		studioAlertEvents({ event: "follow", events: ["sub", "donation"] }),
	).toEqual(["sub", "donation"]);
	for (const value of [
		{ font: "anything;url(file:///etc/passwd)" },
		{ color: "red;display:none" },
		{ duration: 0 },
		{ imageSize: 100 },
		{ fontSize: 1000 },
	])
		expect(studioAlertAppearanceSchema.safeParse(value).success).toBe(false);
	const html = studioAlertHtml({
		width: 640,
		height: 360,
		appearance: DEFAULT_ALERT_APPEARANCE,
		label: '<script>alert("x")</script> % { }',
		fontUrl: "/font.woff2",
		hasMedia: false,
	});
	expect(html).not.toContain("<script>");
	expect(html).toContain("&lt;script&gt;");
	for (const layout of ["above", "beside", "behind", "image-only"] as const) {
		const appearance = { ...DEFAULT_ALERT_APPEARANCE, layout };
		const { media, text } = studioAlertLayout(640, 360, appearance, true);
		expect(media).not.toBeNull();
		if (text) expect(text.x + text.width).toBeLessThanOrEqual(640);
		expect(studioAlertLayout(640, 360, appearance, false).text).toEqual({
			x: 0,
			y: 0,
			width: 640,
			height: 360,
		});
	}
});

test("decodes pictures and GIF frames, strips metadata, and rejects invalid media", async () => {
	for (const format of ["jpeg", "webp", "png"] as const) {
		const input = await sharp({
			create: { width: 16, height: 12, channels: 4, background: "#ff000080" },
		})
			.toFormat(format)
			.toBuffer();
		const result = await validateStudioMedia(input, `image/${format}`);
		expect(result.contentType).toBe("image/png");
		expect([result.width, result.height]).toEqual([16, 12]);
		await expect(validateStudioMedia(input, "image/gif")).rejects.toThrow();
	}
	const pixels = Buffer.alloc(16 * 16 * 4 * 2);
	for (let i = 0; i < pixels.length; i += 4) {
		pixels[i < pixels.length / 2 ? i : i + 1] = 255;
		pixels[i + 3] = 255;
	}
	const gif = await sharp(pixels, {
		raw: { width: 16, height: 32, channels: 4, pageHeight: 16 },
	})
		.gif({ delay: [100, 200], loop: 1 })
		.toBuffer();
	const result = await validateStudioMedia(gif, "image/gif");
	const decoded = await sharp(result.bytes, { animated: true }).metadata();
	expect(result.contentType).toBe("image/gif");
	expect(result.height).toBe(16);
	expect(decoded.pages).toBe(2);
	expect(decoded.delay).toEqual([100, 200]);
	expect(decoded.loop).toBe(0);
	await expect(
		validateStudioMedia(gif.subarray(0, 20), "image/gif"),
	).rejects.toThrow();
	await expect(
		validateStudioMedia(
			Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
			"image/png",
		),
	).rejects.toThrow();
	const slowGif = await sharp(pixels, {
		raw: { width: 16, height: 32, channels: 4, pageHeight: 16 },
	})
		.gif({ delay: [20000, 20000] })
		.toBuffer();
	await expect(validateStudioMedia(slowGif, "image/gif")).rejects.toThrow(
		"30 seconds",
	);
});
