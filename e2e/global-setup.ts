import { request } from "@playwright/test";

const targets = [
	{
		label: "portal",
		url: process.env.PLAYWRIGHT_PORTAL_URL ?? "https://visp.localhost",
	},
	{
		label: "docs",
		url: process.env.PLAYWRIGHT_DOCS_URL ?? "https://docs.visp.localhost",
	},
	{
		label: "admin",
		url: process.env.PLAYWRIGHT_ADMIN_URL ?? "https://admin.visp.localhost",
	},
] as const;

export default async function globalSetup() {
	if (process.env.PLAYWRIGHT_SKIP_HEALTHCHECK) return;

	const context = await request.newContext({ ignoreHTTPSErrors: true });
	const failures: string[] = [];

	for (const target of targets) {
		try {
			const response = await context.get(target.url, { timeout: 10_000 });
			if (!response.ok()) {
				failures.push(
					`${target.label} (${target.url}): HTTP ${response.status()}`,
				);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			failures.push(`${target.label} (${target.url}): ${message}`);
		}
	}

	await context.dispose();

	if (failures.length > 0) {
		throw new Error(
			[
				"Playwright smoke tests need the local VISP stack running.",
				"Start it with: bun run dev:local",
				...failures.map((failure) => `- ${failure}`),
			].join("\n"),
		);
	}
}
