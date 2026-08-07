export const ADVANCED_SETUP_DEFAULTS = {
	software: "visp",
	useCase: "phone_to_obs",
	destination: "twitch",
	advancedMode: true,
	direct: { twitch: false, kick: false, youtube: false },
	prepareObs: true,
} as const;

export function getAdvancedSetupAction(
	onboardedAt: string | null,
): "complete-defaults" | "enable-existing" {
	return onboardedAt ? "enable-existing" : "complete-defaults";
}
