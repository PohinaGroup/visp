// EAS reads the bundle identifiers from native code in the committed ios/
// project (generic workflow), and Android is prebuilt from this config. The
// staging profile sets VISP_ENV=staging so TEST builds get their own
// identifiers and display name; production builds resolve to app.json
// unchanged. iOS TEST builds prebuild in a git worktree — see
// apps/native/scripts/build-staging.sh.
const base = require("./app.json").expo;
const updateChannel =
	process.env.EAS_BUILD_PROFILE ||
	process.env.RELEASE_CHANNEL ||
	(process.env.VISP_ENV === "staging" ? "staging" : "development");

module.exports = {
	...base,
	runtimeVersion: { policy: "fingerprint" },
	updates: {
		url: "https://ota.arvoitus.com",
		codeSigningCertificate: "./certs/certificate.pem",
		codeSigningMetadata: {
			keyid: "main",
			alg: "rsa-v1_5-sha256",
		},
		checkAutomatically: "ON_LOAD",
		fallbackToCacheTimeout: 0,
		useEmbeddedUpdate: true,
		requestHeaders: {
			"expo-channel-name": updateChannel,
			"expo-app-id": base.extra.eas.projectId,
			"xprem-branch": "",
		},
	},
	plugins: [...base.plugins, "expo-updates"],
	...(process.env.VISP_ENV === "staging"
		? {
				name: "VISP (TEST)",
				ios: { ...base.ios, bundleIdentifier: "com.pohinagroup.visp.test" },
				android: { ...base.android, package: "com.pohinagroup.visp.test" },
			}
		: {}),
};
