import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

const portalURL = process.env.PLAYWRIGHT_PORTAL_URL ?? "https://visp.localhost";
const docsURL =
	process.env.PLAYWRIGHT_DOCS_URL ?? "https://docs.visp.localhost";
const adminURL =
	process.env.PLAYWRIGHT_ADMIN_URL ?? "https://admin.visp.localhost";

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: isCI,
	retries: isCI ? 2 : 0,
	workers: isCI ? 1 : undefined,
	reporter: isCI ? [["github"], ["list"]] : "list",
	globalSetup: "./global-setup.ts",
	use: {
		ignoreHTTPSErrors: true,
		trace: "on-first-retry",
	},
	projects: [
		{
			name: "portal",
			testMatch: /portal\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				baseURL: portalURL,
			},
		},
		{
			name: "docs",
			testMatch: /docs\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				baseURL: docsURL,
			},
		},
		{
			name: "admin",
			testMatch: /admin\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				baseURL: adminURL,
			},
		},
	],
});
