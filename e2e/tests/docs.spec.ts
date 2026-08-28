import { expect, test } from "@playwright/test";

test.describe("docs", () => {
	test("docs home renders", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/VISP Relay Documentation/);
		await expect(
			page.getByRole("heading", {
				name: "Your phone goes live. OBS is optional.",
			}),
		).toBeVisible();
		await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
	});

	test("get started page renders", async ({ page }) => {
		await page.goto("/docs/get-started");
		await expect(
			page.getByRole("heading", { name: "Get started" }),
		).toBeVisible();
	});
});
