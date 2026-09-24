/** @type {import('@expo/fingerprint').Config} */

function stripDotSlash(value) {
	if (typeof value === "string" && value.startsWith("./")) {
		return value.slice(2);
	}
	if (Array.isArray(value)) {
		return value.map(stripDotSlash);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, nested]) => [
				key,
				stripDotSlash(nested),
			]),
		);
	}
	return value;
}

function stringifySorted(value) {
	return JSON.stringify(value, (_, nested) => {
		if (Array.isArray(nested)) {
			return [...nested].sort((left, right) =>
				stringifySorted(left).localeCompare(stringifySorted(right)),
			);
		}
		if (nested && typeof nested === "object") {
			return Object.fromEntries(
				Object.entries(nested).sort(([left], [right]) =>
					left.localeCompare(right),
				),
			);
		}
		return nested;
	});
}

// Bun store paths embed install hashes. EAS reinstalls into a temp dir, so the
// same package can appear as node_modules/.bun/pkg@1.0.0+deadbeef/node_modules/pkg
// locally and as a hoisted node_modules/pkg on the builder.
function canonicalizeNodeModulePaths(text) {
	return String(text)
		.replace(
			/node_modules\/\.bun\/@([^/]+)\+([^@/]+)@[^/]+\/node_modules\/@\1\/\2/g,
			"node_modules/@$1/$2",
		)
		.replace(
			/node_modules\/\.bun\/([^@/+\s"']+)@[^/]+\/node_modules\/\1/g,
			"node_modules/$1",
		)
		.replace(/\+[a-f0-9]{16}/g, "");
}

// CocoaPods and EAS rewrite Xcode formatting, signing, and build numbers after
// the archive fingerprint is calculated. Keep the native settings in the hash.
function normalizeNativeConfig(value) {
	if (Array.isArray(value)) return value.map(normalizeNativeConfig);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.filter(
					([key, nested]) =>
						!key.endsWith("_comment") &&
						key !== "comment" &&
						![
							"CODE_SIGN_IDENTITY",
							"CODE_SIGN_STYLE",
							"DEVELOPMENT_TEAM",
							"DevelopmentTeam",
							"PROVISIONING_PROFILE_SPECIFIER",
							"ProvisioningStyle",
						].includes(key) &&
						!(
							value.isa === "PBXFileSystemSynchronizedRootGroup" &&
							(key === "name" || (key === "exceptions" && nested.length === 0))
						),
				)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, nested]) => [key, normalizeNativeConfig(nested)]),
		);
	}
	if (typeof value === "string" && value.startsWith('"')) {
		try {
			return JSON.parse(value);
		} catch {
			/* Xcode also permits unquoted strings. */
		}
	}
	return value;
}

const config = {
	sourceSkips: ["ExpoConfigVersions"],
	ignorePaths: [
		"**/project.xcworkspace/**/*",
		"**/ios/**/*.xcworkspace/**/*",
		"**/ios/Podfile.lock",
		"**/ios/**/Expo.plist",
		"**/ios/SourcePackages/**/*",
		"**/Package.resolved",
		"**/.build-libsrt/**/*",
		"**/libsrt.xcframework/**/*",
		"**/vendor/ios/**/*",
		"**/vendor/android/**/*",
		"**/vendor/include/**/*",
	],
	extraSources: [
		{
			type: "file",
			filePath: "modules/visp-srt/scripts/build-libsrt.sh",
			reasons: ["libsrt"],
		},
	],
	fileHookTransform(source, chunk, isEndOfFile) {
		if (
			source.type === "file" &&
			["ios/VISP/Info.plist", "ios/VISP.xcodeproj/project.pbxproj"].includes(
				source.filePath,
			)
		) {
			if (!isEndOfFile) return null;
			const expoPath = require.resolve("expo/package.json");
			if (source.filePath.endsWith("Info.plist")) {
				const plist = require(
					require.resolve("@expo/plist", { paths: [expoPath] }),
				).default;
				const info = plist.parse(
					require("node:fs").readFileSync(source.filePath, "utf8"),
				);
				delete info.CFBundleVersion;
				return JSON.stringify(normalizeNativeConfig(info));
			}
			const xcode = require(require.resolve("xcode", { paths: [expoPath] }));
			return JSON.stringify(
				normalizeNativeConfig(
					xcode.project(source.filePath).parseSync().hash.project,
				),
			);
		}
		if (chunk == null) {
			return chunk;
		}
		if (source.type === "contents" && source.id === "expoConfig") {
			const expoConfig = JSON.parse(String(chunk));
			delete expoConfig.updates;
			return stringifySorted(stripDotSlash(expoConfig));
		}
		if (source.type === "contents") {
			return canonicalizeNodeModulePaths(chunk);
		}
		return chunk;
	},
};

module.exports = config;
