export function formatUtc(value: string) {
	return `${value.replace("T", " ").slice(0, 16)} UTC`;
}

export function providerLabel(provider: "twitch" | "kick" | "youtube") {
	return provider === "twitch"
		? "Twitch"
		: provider === "kick"
			? "Kick"
			: "YouTube";
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
	// A disconnected plugin never acknowledges, so "not acknowledged yet" would
	// sit there forever and read like OBS is thinking about it.
	if (!status.connected) {
		return status.pending
			? "OBS is offline, so your last command has not been delivered. It is applied when OBS reconnects."
			: "OBS is paired but not connected. Start OBS with the VISP plugin.";
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
