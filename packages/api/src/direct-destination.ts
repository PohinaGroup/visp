import { DirectError, type DirectProvider } from "./direct-model";

function hasUnsafeDestinationCharacter(value: string) {
	for (const character of value) {
		const codePoint = character.codePointAt(0) ?? 0;
		if (character.trim() === "" || codePoint < 32 || codePoint === 127) {
			return true;
		}
	}
	return false;
}

function trustedProviderHost(provider: DirectProvider, hostname: string) {
	switch (provider) {
		case "twitch":
			return hostname === "ingest.global-contribute.live-video.net";
		case "kick":
			return (
				hostname === "stream.kick.com" ||
				/^[a-z0-9-]+\.global-contribute\.live-video\.net$/u.test(hostname)
			);
		case "youtube":
			return hostname.endsWith(".rtmp.youtube.com");
	}
}

export function validateDirectDestination(
	provider: DirectProvider,
	destination: string,
) {
	const invalid = () => {
		throw new DirectError("invalid", "Invalid Direct destination");
	};
	if (hasUnsafeDestinationCharacter(destination)) invalid();
	try {
		const url = new URL(destination);
		const decodedPath = decodeURIComponent(url.pathname);
		if (
			url.protocol !== "rtmps:" ||
			url.username ||
			url.password ||
			!trustedProviderHost(provider, url.hostname) ||
			url.search ||
			url.hash ||
			(url.port !== "" && url.port !== "443") ||
			decodedPath.split("/").filter(Boolean).length < 2 ||
			hasUnsafeDestinationCharacter(decodedPath)
		) {
			invalid();
		}
	} catch (error) {
		if (error instanceof DirectError) throw error;
		invalid();
	}
	return destination;
}
