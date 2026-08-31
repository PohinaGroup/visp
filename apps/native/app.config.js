// EAS reads the bundle identifiers from native code in the committed ios/
// project (generic workflow), and Android is prebuilt from this config. The
// staging profile sets VISP_ENV=staging so TEST builds get their own
// identifiers and display name; production builds resolve to app.json
// unchanged. iOS TEST builds prebuild in a git worktree — see
// apps/native/scripts/build-staging.sh.
const base = require("./app.json").expo;

if (process.env.VISP_ENV !== "staging") {
	module.exports = base;
} else {
	module.exports = {
		...base,
		name: "VISP (TEST)",
		ios: {
			...base.ios,
			bundleIdentifier: "com.pohinagroup.visp.test",
		},
		android: {
			...base.android,
			package: "com.pohinagroup.visp.test",
		},
	};
}
