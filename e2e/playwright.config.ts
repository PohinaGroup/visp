import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const isolatedPortal = Boolean(process.env.PLAYWRIGHT_ISOLATED_PORTAL);

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
	globalSetup: isolatedPortal ? undefined : "./global-setup.ts",
	webServer: isolatedPortal
		? {
				command: "bun run --cwd apps/web dev:app",
				cwd: new URL("..", import.meta.url).pathname,
				url: portalURL,
				timeout: 120_000,
				env: {
					VITE_RYBBIT_SITE_ID: "",
					VITE_SERVER_URL: portalURL,
					PORT: new URL(portalURL).port,
				},
			}
		: undefined,
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
