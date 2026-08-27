import { expect, test } from "@playwright/test";

test.describe("portal", () => {
	test("landing page renders", async ({ page }) => {
		await page.goto("/");
		await expect(page).toHaveTitle(/VISP/);
		await expect(
			page.getByRole("heading", {
				name: "Your phone is the camera.",
			}),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Try VISP free" }),
		).toBeVisible();
	});

	test("login page shows OAuth providers", async ({ page }) => {
		await page.goto("/login");
		await expect(
			page.getByRole("heading", { name: "Sign in to VISP" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Continue with Twitch" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Continue with Kick" }),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Continue with Google" }),
		).toBeVisible();
	});

	test("finnish landing page renders", async ({ page }) => {
		await page.goto("/fi");
		await expect(
			page.getByRole("heading", {
				name: "Puhelimesi on kamera.",
			}),
		).toBeVisible();
		await expect(
			page.getByRole("button", { name: "Kokeile VISPiä ilmaiseksi" }),
		).toBeVisible();
	});
});
