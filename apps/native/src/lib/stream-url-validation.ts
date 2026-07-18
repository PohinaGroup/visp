export function validateStreamUrl(input: string): string {
	const value = input.trim();
	let url: URL;

	try {
		url = new URL(value);
	} catch {
		throw new Error("Enter a valid SRT URL.");
	}

	const port = Number(url.port);
	const streamId = url.searchParams.get("streamid");
	if (
		url.protocol !== "srt:" ||
		!url.hostname ||
		!url.port ||
		!Number.isInteger(port) ||
		port < 1 ||
		port > 65_535 ||
		!streamId?.startsWith("publish:")
	) {
		throw new Error("Paste the SRT publish URL supplied by VISP.");
	}

	return value;
}

export type PublishCredentials = {
	password: string;
	path: string;
	user: string;
};

export function parsePublishCredentials(input: string): PublishCredentials {
	const url = new URL(validateStreamUrl(input));
	const parts = url.searchParams.get("streamid")?.split(":") ?? [];
	if (
		parts.length !== 4 ||
		parts[0] !== "publish" ||
		!parts[1] ||
		!parts[2] ||
		!parts[3]
	) {
		throw new Error("Paste the SRT publish URL supplied by VISP.");
	}
	return { path: parts[1], user: parts[2], password: parts[3] };
}

export function describeStreamUrl(value: string): string {
	try {
		return new URL(value).host;
	} catch {
		return "Saved VISP destination";
	}
}

export function selectPublishUrl(
	urls: readonly { srt: string }[] | undefined,
): string {
	const url = urls?.[0]?.srt;
	if (!url) {
		throw new Error("No active VISP path is available.");
	}
	return validateStreamUrl(url);
}
