export function formatUtc(value: string) {
	return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

export function providerLabel(provider: "twitch" | "kick") {
	return provider === "twitch" ? "Twitch" : "Kick";
}

export function publishOriginLabel(
	origin: "native" | "web" | "legacy" | string,
) {
	switch (origin) {
		case "native":
			return "VISP Native";
		case "web":
			return "Web";
		case "legacy":
			return "Legacy";
		default:
			return origin;
	}
}

export function obsStatusMessage(
	status:
		| {
				configured: boolean;
				connected: boolean;
				pending: boolean;
				streaming: boolean;
		  }
		| null
		| undefined,
) {
	if (!status?.configured) {
		return "OBS is not paired yet. Open plugin pairing below to connect it.";
	}
	if (status.pending) {
		return "OBS has not acknowledged the latest command yet.";
	}
	if (status.streaming) {
		return "OBS reports that the stream is live.";
	}
	return "OBS reports that the stream is stopped.";
}

export function credentialsHint(options: {
	configured: boolean | undefined;
	revealable: boolean | undefined;
}) {
	if (!options.configured) {
		return "Generate read credentials to receive your device feeds in OBS.";
	}
	if (options.revealable) {
		return "Reveal your read URLs anytime — one per device, including newly added ones. Rotating replaces the secret and breaks existing OBS sources.";
	}
	return "Read credentials from before revealing was supported can only be replaced. Rotate once to make them revealable.";
}
