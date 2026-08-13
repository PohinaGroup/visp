/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
	type: "watch",
	name: "VISP Watch",
	displayName: "VISP",
	bundleIdentifier: ".watchkitapp",
	deploymentTarget: "10.0",
	// Light background: watchOS crops to a circle and App Review rejects a
	// black icon for not reading as circular. See scripts/gen-watch-icon.py.
	icon: "../../assets/images/watch-icon.png",
	appleTeamId: config.ios?.appleTeamId,
	frameworks: ["SwiftUI", "WatchConnectivity"],
});
