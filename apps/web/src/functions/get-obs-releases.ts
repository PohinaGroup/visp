import { createServerFn } from "@tanstack/react-start";

import { legalEntity } from "@/lib/legal";
import {
	githubRepoFromSourceUrl,
	parseObsPluginRelease,
	type ObsPluginRelease,
} from "@/lib/obs-releases";

const CACHE_TTL_MS = 5 * 60 * 1000;

let cachedRelease:
	| { expiresAt: number; value: ObsPluginRelease | null }
	| undefined;

async function fetchLatestObsPluginRelease(): Promise<ObsPluginRelease | null> {
	const now = Date.now();
	if (cachedRelease && cachedRelease.expiresAt > now) {
		return cachedRelease.value;
	}

	const repo = githubRepoFromSourceUrl(legalEntity.sourceUrl);
	if (!repo) {
		cachedRelease = { expiresAt: now + CACHE_TTL_MS, value: null };
		return null;
	}

	const response = await fetch(
		`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases/latest`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "visp-web",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);

	if (!response.ok) {
		cachedRelease = { expiresAt: now + CACHE_TTL_MS, value: null };
		return null;
	}

	const release = parseObsPluginRelease(await response.json());
	const value = release.assets.length > 0 ? release : null;
	cachedRelease = { expiresAt: now + CACHE_TTL_MS, value };
	return value;
}

export const getObsPluginRelease = createServerFn({ method: "GET" }).handler(
	async (): Promise<ObsPluginRelease | null> => {
		try {
			return await fetchLatestObsPluginRelease();
		} catch {
			return null;
		}
	},
);
