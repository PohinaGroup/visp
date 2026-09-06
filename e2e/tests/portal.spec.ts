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
			page.locator("section").first().getByRole("button", {
				name: "Try VISP free",
			}),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: "Live from your phone in three steps",
			}),
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
			page.locator("section").first().getByRole("button", {
				name: "Kokeile VISPiä ilmaiseksi",
			}),
		).toBeVisible();
		await expect(
			page.getByRole("heading", {
				name: "Puhelimesta suorana kolmessa vaiheessa",
			}),
		).toBeVisible();
	});
});

test("phone visitors can switch languages", async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto("/");
	await page.getByRole("link", { name: "FI", exact: true }).click();
	await expect(
		page.getByRole("link", { name: "EN", exact: true }),
	).toBeVisible();
});

test("signed-in setup and dashboard distinguish failed output and unavailable status", async ({
	page,
}) => {
	test.setTimeout(60_000);
	let onboarded = false;
	let unavailable = false;
	let outputState = "failed";
	let publishing = true;
	let regionId = 2;
	await page.route("**/api/auth/**", (route) =>
		route.fulfill({
			json: {
				user: {
					id: "browser-test",
					name: "Test creator",
					email: "creator@example.test",
				},
				session: { id: "test-session", expiresAt: "2099-01-01T00:00:00Z" },
			},
		}),
	);
	await page.route("**/trpc/**", async (route) => {
		const procedures = new URL(route.request().url()).pathname
			.split("/trpc/")[1]!
			.split(",");
		const path = {
			id: 1,
			label: "Phone",
			publishing,
			stale: false,
			publishRevealable: true,
			slug: "test-phone",
			maskedUrls: { publish: null, read: null },
			relay: {
				id: regionId,
				name: regionId === 2 ? "us-1" : "default",
				region: regionId === 2 ? "US" : "Finland",
				pingUrl: "https://relay.test/ping",
			},
		};
		const result = procedures.map((procedure) => {
			if (procedure === "paths.moveRelay") regionId = 1;
			if (procedure === "direct.list" && unavailable)
				return {
					error: {
						message: "Status unavailable",
						code: -32603,
						data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
					},
				};
			const data: Record<string, unknown> = {
				"secrets.status": { onboardedAt: onboarded ? "2026-09-05" : null },
				"paths.list": [path],
				"relays.list": [
					{
						id: 1,
						name: "default",
						region: "Finland",
						pingUrl: "https://relay.test/ping",
					},
				],
				"studio.get": {
					settings: { available: false, enabled: false },
					preview: {},
				},
				"obs.snapshots": [],
				"direct.list": {
					mode: "direct",
					desired: { twitch: true, kick: false, youtube: false },
					providers: [],
					customOutputs: [],
					customDestinations: [],
					youtubeTitle: "Test",
					paths: [
						{
							...path,
							twitch: true,
							kick: false,
							youtube: false,
							state: { twitch: outputState },
							error: { twitch: "Platform refused connection" },
						},
					],
					destinations: [
						{ id: "test", pathId: 1, provider: "twitch", state: outputState },
					],
				},
			};
			return { result: { data: data[procedure] ?? null } };
		});
		await route.fulfill({ json: result });
	});
	await page.goto("/setup");
	await expect(
		page.getByRole("heading", { name: "Let's get you streaming" }),
	).toBeVisible();
	onboarded = true;
	await page.goto("/dashboard");
	await expect(
		page.getByRole("heading", { name: "Output failed", exact: true }),
	).toBeVisible();
	await expect(
		page.getByText("Your stream is on air.", { exact: true }),
	).toHaveCount(0);
	outputState = "starting";
	await expect(
		page.getByRole("heading", { name: "Output starting", exact: true }),
	).toBeVisible({ timeout: 10_000 });
	outputState = "live";
	await expect(
		page.getByRole("heading", { name: "Live", exact: true }),
	).toBeVisible({ timeout: 10_000 });
	unavailable = true;
	await expect(
		page.getByText("Showing last known state. Retrying automatically."),
	).toBeVisible({ timeout: 20_000 });
	await expect(
		page.getByRole("button", { name: "End stream", exact: true }),
	).toBeDisabled();
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "Status unavailable", exact: true }),
	).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText("Almost ready", { exact: true })).toHaveCount(0);

	// A drained US relay is absent from discovery; Finland must still be offered.
	unavailable = false;
	publishing = false;
	outputState = "stopped";
	await page.reload();
	await page.getByRole("button", { name: "Necessary only" }).click();
	await page.getByRole("button", { name: "Settings", exact: true }).click();
	await page.getByText("Phone", { exact: true }).first().click();
	const move = page.getByRole("button", { name: "Move to Finland · default" });
	await expect(move).toBeVisible();
	page.once("dialog", (dialog) => dialog.dismiss());
	await move.click();
	expect(regionId).toBe(2);
	page.once("dialog", (dialog) => dialog.accept());
	await move.click();
	await expect(
		page.getByText("Relay: Finland · default", { exact: true }),
	).toBeVisible();
});
