/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
	type: "watch",
	name: "VISP Watch",
	displayName: "VISP",
	bundleIdentifier: ".watchkitapp",
	deploymentTarget: "10.0",
	icon: "../../assets/images/icon.png",
	appleTeamId: config.ios?.appleTeamId,
	frameworks: ["SwiftUI", "WatchConnectivity"],
});
