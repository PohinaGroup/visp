/** Platforms we surface as OBS plugin download buttons. */
export type ObsPluginPlatform = "windows" | "macos" | "linux";

export type ObsPluginAsset = {
	platform: ObsPluginPlatform;
	label: string;
	fileName: string;
	downloadUrl: string;
};

export type ObsPluginRelease = {
	tagName: string;
	htmlUrl: string;
	assets: ObsPluginAsset[];
};

type GitHubReleaseAsset = {
	name: string;
	browser_download_url: string;
};

type GitHubRelease = {
	tag_name: string;
	html_url: string;
	assets: GitHubReleaseAsset[];
};

const PLATFORM_ORDER: ObsPluginPlatform[] = ["windows", "macos", "linux"];

const PLATFORM_LABELS: Record<ObsPluginPlatform, string> = {
	windows: "Windows",
	macos: "macOS",
	linux: "Ubuntu",
};

export function detectObsPluginPlatform(
	userAgent: string,
): ObsPluginPlatform | null {
	if (/windows/i.test(userAgent)) return "windows";
	if (/macintosh|macintel/i.test(userAgent)) return "macos";
	if (!/android/i.test(userAgent) && /linux|x11/i.test(userAgent))
		return "linux";
	return null;
}

/** Classify a release asset name into a user-facing OBS install package. */
export function classifyObsPluginAsset(
	fileName: string,
): ObsPluginPlatform | null {
	const name = fileName.toLowerCase();

	if (name.endsWith("-windows-x64.zip")) {
		return "windows";
	}
	if (name.endsWith("-macos-universal.pkg")) {
		return "macos";
	}
	if (name.endsWith("-x86_64-linux-gnu.deb")) {
		return "linux";
	}

	return null;
}

export function pickObsPluginAssets(
	assets: GitHubReleaseAsset[],
): ObsPluginAsset[] {
	const byPlatform = new Map<ObsPluginPlatform, ObsPluginAsset>();

	for (const asset of assets) {
		const platform = classifyObsPluginAsset(asset.name);
		if (!platform || byPlatform.has(platform)) {
			continue;
		}
		byPlatform.set(platform, {
			platform,
			label: PLATFORM_LABELS[platform],
			fileName: asset.name,
			downloadUrl: asset.browser_download_url,
		});
	}

	return PLATFORM_ORDER.flatMap((platform) => {
		const asset = byPlatform.get(platform);
		return asset ? [asset] : [];
	});
}

export function parseObsPluginRelease(
	release: GitHubRelease,
): ObsPluginRelease {
	return {
		tagName: release.tag_name,
		htmlUrl: release.html_url,
		assets: pickObsPluginAssets(release.assets),
	};
}

export function githubRepoFromSourceUrl(sourceUrl: string): {
	owner: string;
	repo: string;
} | null {
	try {
		const url = new URL(sourceUrl);
		if (url.hostname !== "github.com") {
			return null;
		}
		const [owner, repo] = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
		if (!owner || !repo) {
			return null;
		}
		return { owner, repo: repo.replace(/\.git$/, "") };
	} catch {
		return null;
	}
}
