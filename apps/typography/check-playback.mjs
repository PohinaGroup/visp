import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Run with the typography dev server: node apps/typography/check-playback.mjs
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	await page.route("**/api/typography/**", (route) => route.fulfill({ json: [] }));
	const projectUrl = "**/api/typography/projects";
	await page.route(projectUrl, (route) => route.fulfill({ json: [{
		id: "delayed-speech", title: "delayed-speech.mp4", language: "en", state: "ready",
		document: { style: "Hormozi", intensity: 68, hook: "", captionY: 61, words: [
			{ id: "1", text: "The", start: 5.69, end: 5.77, emphasis: 0, group: 0 },
			{ id: "2", text: "future", start: 5.8, end: 6.2, emphasis: 0.96, group: 0 },
		] },
	}] }));
	await page.goto(process.env.TYPOGRAPHY_URL ?? "http://127.0.0.1:5175");
	const playhead = page.getByRole("slider", { name: "Playhead", exact: true });
	const caption = page.locator(".caption-preview");
	await page.getByRole("button", { name: "delayed-speech", exact: true }).waitFor();
	for (const time of [5.12, 5.68, 5.69, 5.8, 5.12]) {
		await playhead.fill(String(time));
		assert.equal((await caption.locator("span").allTextContents()).join(" "),
			time < 5.69 ? "" : "The future", `Delayed speech caption at ${time}s`);
	}
	await page.unroute(projectUrl);
	await page.route(projectUrl, (route) => route.fulfill({ json: [{
		id: "long-video", title: "long-video.mov", language: "en", state: "ready",
		document: { style: "Hormozi", intensity: 68, hook: "", captionY: 61,
			words: Array.from({ length: 709 }, (_, index) => ({
				id: String(index + 1), text: "transcript", start: index / 2,
				end: (index + 1) / 2, emphasis: 0, group: Math.floor(index / 4),
			})),
		},
	}] }));
	await page.route("**/projects/long-video/video", (route) => route.fulfill({ json: { url: "https://media.invalid/source" } }));
	await page.route("https://media.invalid/source", (route) => route.abort());
	await page.reload();
	await page.locator("video").waitFor();
	await page.locator("video").evaluate((video) => {
		Object.defineProperty(video, "duration", { value: 390.4 });
		video.dispatchEvent(new Event("loadedmetadata"));
		video.dispatchEvent(new Event("durationchange"));
	});
	assert.equal(Number(await playhead.getAttribute("max")), 390.4, "Seek range must cover the entire video");
	await playhead.fill("300");
	assert.equal(await page.locator("video").evaluate((video) => video.currentTime), 300);
	assert.ok(await page.locator(".transcript-panel").evaluate((panel) =>
		panel.getBoundingClientRect().height <= panel.parentElement.getBoundingClientRect().height),
		"Long transcripts must not stretch the editor beyond the workspace");
	assert.ok(await page.locator(".timeline-word").last().evaluate((word) =>
		parseFloat(word.style.left) < 100), "Late captions must remain within the timeline");
	// A long render must keep polling beyond the former four-minute cutoff.
	const fastExportPolling = () => {
		const timeout = window.setTimeout;
		window.setTimeout = (callback, delay, ...args) => timeout(callback, delay === 3_000 ? 0 : delay, ...args);
	};
	await page.evaluate(fastExportPolling);
	await page.addInitScript(fastExportPolling);
	let exportPolls = 0;
	let exportStarts = 0;
	await page.route("**/projects/long-video/export", (route) => {
		if (route.request().method() === "POST") {
			exportStarts++;
			return route.fulfill({ json: { ok: true } });
		}
		return ++exportPolls <= 85
			? route.fulfill({ status: 202, json: { url: null } })
			: route.fulfill({ json: { url: "https://media.invalid/export.mp4" } });
	});
	await page.getByRole("button", { name: "Export", exact: true }).click();
	await page.getByRole("link", { name: "Download MP4" }).waitFor({ timeout: 5_000 });
	assert.equal(exportPolls, 86, "Wait for completion without restarting the render");
	exportPolls = 0;
	await page.reload();
	await page.getByRole("link", { name: "Download MP4" }).waitFor({ timeout: 5_000 });
	assert.ok(exportPolls >= 86, "Resume polling an existing export after reload");
	assert.equal(exportStarts, 1, "Reload must not restart the export");
	await page.getByRole("button", { name: "Export again", exact: true }).click();
	await page.getByRole("link", { name: "Download MP4" }).waitFor({ timeout: 5_000 });
	assert.equal(exportStarts, 2, "A completed export can be rendered again after edits");
	await page.unroute(projectUrl);
	await page.reload();
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
	console.log("PASS: captions wait for speech, stay stable through timing gaps and backward seeks; emphasis does not blink.");
} finally {
	await browser.close();
}
