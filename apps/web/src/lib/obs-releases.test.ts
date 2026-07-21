import { describe, expect, test } from "bun:test";

import {
	classifyObsPluginAsset,
	detectObsPluginPlatform,
	githubRepoFromSourceUrl,
	parseObsPluginRelease,
	pickObsPluginAssets,
} from "./obs-releases";

test("detects desktop OBS platforms without treating Android as Linux", () => {
	expect(detectObsPluginPlatform("Windows NT 10.0; Win64; x64")).toBe(
		"windows",
	);
	expect(detectObsPluginPlatform("Macintosh; Intel Mac OS X 10_15_7")).toBe(
		"macos",
	);
	expect(detectObsPluginPlatform("X11; Linux x86_64")).toBe("linux");
	expect(detectObsPluginPlatform("Linux; Android 15")).toBeNull();
});

describe("classifyObsPluginAsset", () => {
	test("maps install packages to platforms", () => {
		expect(classifyObsPluginAsset("visp-obs-1.0.12-windows-x64.zip")).toBe(
			"windows",
		);
		expect(classifyObsPluginAsset("visp-obs-1.0.12-macos-universal.pkg")).toBe(
			"macos",
		);
		expect(classifyObsPluginAsset("visp-obs-1.0.12-x86_64-linux-gnu.deb")).toBe(
			"linux",
		);
	});

	test("ignores debug, source, and checksum assets", () => {
		expect(classifyObsPluginAsset("SHA256SUMS.txt")).toBeNull();
		expect(
			classifyObsPluginAsset("visp-obs-1.0.12-macos-universal-dSYMs.tar.xz"),
		).toBeNull();
		expect(classifyObsPluginAsset("visp-obs-1.0.12-source.tar.xz")).toBeNull();
		expect(
			classifyObsPluginAsset("visp-obs-1.0.12-x86_64-linux-gnu-dbgsym.ddeb"),
		).toBeNull();
	});
});

describe("pickObsPluginAssets", () => {
	test("returns one asset per platform in display order", () => {
		const assets = pickObsPluginAssets([
			{
				name: "visp-obs-1.0.12-x86_64-linux-gnu.deb",
				browser_download_url: "https://example.com/linux.deb",
			},
			{
				name: "SHA256SUMS.txt",
				browser_download_url: "https://example.com/SHA256SUMS.txt",
			},
			{
				name: "visp-obs-1.0.12-windows-x64.zip",
				browser_download_url: "https://example.com/windows.zip",
			},
			{
				name: "visp-obs-1.0.12-macos-universal.pkg",
				browser_download_url: "https://example.com/macos.pkg",
			},
		]);

		expect(assets.map((asset) => asset.platform)).toEqual([
			"windows",
			"macos",
			"linux",
		]);
		expect(assets[0]?.label).toBe("Windows");
		expect(assets[1]?.label).toBe("macOS");
		expect(assets[2]?.label).toBe("Ubuntu");
	});
});

describe("parseObsPluginRelease", () => {
	test("keeps tag and release page url", () => {
		const release = parseObsPluginRelease({
			tag_name: "v1.0.12",
			html_url: "https://github.com/PohinaGroup/visp/releases/tag/v1.0.12",
			assets: [
				{
					name: "visp-obs-1.0.12-windows-x64.zip",
					browser_download_url: "https://example.com/windows.zip",
				},
			],
		});

		expect(release.tagName).toBe("v1.0.12");
		expect(release.htmlUrl).toContain("/releases/tag/v1.0.12");
		expect(release.assets).toHaveLength(1);
	});
});

describe("githubRepoFromSourceUrl", () => {
	test("parses owner and repo from github source url", () => {
		expect(
			githubRepoFromSourceUrl("https://github.com/PohinaGroup/visp"),
		).toEqual({ owner: "PohinaGroup", repo: "visp" });
		expect(
			githubRepoFromSourceUrl("https://github.com/PohinaGroup/visp.git"),
		).toEqual({ owner: "PohinaGroup", repo: "visp" });
	});

	test("returns null for non-github urls", () => {
		expect(githubRepoFromSourceUrl("https://example.com/visp")).toBeNull();
	});
});
