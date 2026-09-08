import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Run with the typography dev server: node apps/typography/check-playback.mjs
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	await page.route("**/api/typography/**", (route) => route.fulfill({ json: [] }));
	await page.goto(process.env.TYPOGRAPHY_URL ?? "http://127.0.0.1:5175");
	const playhead = page.getByRole("slider", { name: "Playhead", exact: true });
	const caption = page.locator(".caption-preview");
	await caption.waitFor();
	const phrases = [
		[302, "I think the"],
		[359, "biggest mistake"],
		[462, "companies make is trying to"],
		[596, "automate everything."],
	];
	// Seek in both directions, including every gap between words and phrases.
	for (const direction of [1, -1]) {
		for (let frame = 0; frame <= 402; frame++) {
			const time = direction === 1 ? 302 + frame : 704 - frame;
			await playhead.fill(String(time / 100));
			const text = await caption.locator("span").allTextContents();
			assert.equal(text.join(" "), phrases.findLast(([start]) => start <= time)[1], `Caption at ${time / 100}s`);
		}
	}
	// Emphasized words must not blink white as their active state changes.
	await playhead.fill("3.6");
	const emphasized = caption.getByText("biggest", { exact: true });
	const activeColor = await emphasized.evaluate((element) => getComputedStyle(element).color);
	await playhead.fill("4.04");
	assert.equal(await emphasized.evaluate((element) => getComputedStyle(element).color), activeColor);
	for (const [width, height] of [[1024, 768], [1280, 720], [1920, 1080]]) {
		await page.setViewportSize({ width, height });
		await playhead.fill("3.6");
		const fits = await caption.evaluate((element) => {
			const bounds = element.getBoundingClientRect();
			const words = [...element.children].map((word) => word.getBoundingClientRect());
			return words.every((word, index) =>
				word.left >= bounds.left && word.right <= bounds.right &&
				words.slice(index + 1).every((next) =>
					word.right < next.left || next.right < word.left ||
					word.bottom <= next.top || next.bottom <= word.top));
		});
		assert.ok(fits, `Enlarged captions must fit without overlapping at ${width}x${height}`);
	}
	console.log("PASS: captions stay stable through every timing gap and backward seek; emphasis does not blink.");
} finally {
	await browser.close();
}
