import { expect, test } from "@playwright/test";

test.describe("admin", () => {
	test("sign-in screen renders", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/VISP Admin/);
		await expect(page.getByText("VISP Admin")).toBeVisible();
		await expect(
			page.getByText(/Sign in with the same Twitch, Kick, or Google account/),
		).toBeVisible();
	});
});
