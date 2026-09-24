import { expect, test } from "@playwright/test";

const project = {
	id: "00000000-0000-4000-8000-000000000001",
	title: "sample.mp4",
	language: "en",
	state: "ready",
	document: {
		version: 1,
		words: [
			{ id: "4", text: "original", start: 0, end: 1, emphasis: 0, group: 0 },
		],
		style: "Hormozi",
		intensity: 68,
		hook: "",
		captionY: 61,
	},
};

test("a failed caption save can be retried", async ({ page }) => {
	let saves = 0;
	await page.route("**/api/typography/projects**", async (route) => {
		const { pathname } = new URL(route.request().url());
		if (route.request().method() === "PUT") {
			saves++;
			await route.fulfill(
				saves === 1
					? { status: 500, body: "save failed" }
					: { json: { ok: true } },
			);
		} else if (pathname.endsWith("/video") || pathname.endsWith("/export")) {
			await route.fulfill({ status: 404 });
		} else {
			await route.fulfill({ json: [project] });
		}
	});
	await page.goto("/");
	await expect(
		page.getByRole("textbox", { name: "Selected word" }),
	).toHaveValue("original");
	await page.getByRole("textbox", { name: "Selected word" }).fill("changed");
	await expect(page.locator(".save-state")).toContainText("Saving");
	await expect(page.locator(".save-state")).toContainText("Save failed");
	await expect(
		page.getByText("Could not save this edit. Check your connection."),
	).toBeVisible();
	await page.getByRole("button", { name: "Retry save" }).click();
	await expect(page.locator(".save-state")).toContainText("Saved");
	expect(saves).toBe(2);
});

test("caption saves finish in edit order", async ({ page }) => {
	let releaseFirst: (() => void) | undefined;
	const firstResponse = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const savedWords: string[] = [];
	await page.route("**/api/typography/projects**", async (route) => {
		const { pathname } = new URL(route.request().url());
		if (route.request().method() === "PUT") {
			const body = route.request().postDataJSON() as {
				document: { words: Array<{ text: string }> };
			};
			savedWords.push(body.document.words[0]?.text ?? "");
			if (savedWords.length === 1) await firstResponse;
			await route.fulfill({ json: { ok: true } });
		} else if (pathname.endsWith("/video") || pathname.endsWith("/export")) {
			await route.fulfill({ status: 404 });
		} else {
			await route.fulfill({ json: [project] });
		}
	});
	await page.goto("/");
	const word = page.getByRole("textbox", { name: "Selected word" });
	await expect(word).toHaveValue("original");
	await word.fill("first");
	await expect.poll(() => savedWords.length).toBe(1);
	await word.fill("second");
	await page.waitForTimeout(900);
	expect(savedWords).toEqual(["first"]);
	releaseFirst?.();
	await expect(page.locator(".save-state")).toContainText("Saved");
	expect(savedWords).toEqual(["first", "second"]);
});
