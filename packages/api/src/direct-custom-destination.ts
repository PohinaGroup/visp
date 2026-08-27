import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const CUSTOM_DIRECT_PROTOCOLS = ["rtmp", "rtmps", "srt"] as const;
export type CustomDirectProtocol = (typeof CUSTOM_DIRECT_PROTOCOLS)[number];
export type HostResolver = (hostname: string) => Promise<string[]>;

function hasUnsafeCharacters(value: string) {
	return [...value].some((character) => {
		const code = character.charCodeAt(0);
		return code <= 32 || code === 127;
	});
}

function invalid(): never {
	throw new Error("Destination URL is not valid");
}

function ipv4Parts(address: string) {
	const parts = address.split(".").map(Number);
	return parts.length === 4 && parts.every((part) => part >= 0 && part <= 255)
		? parts
		: null;
}

export function isPublicAddress(address: string): boolean {
	const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
	if (isIP(normalized) === 4) {
		const [a = 0, b = 0, c = 0] = ipv4Parts(normalized) ?? [];
		return !(
			a === 0 ||
			a === 10 ||
			(a === 100 && b >= 64 && b <= 127) ||
			a === 127 ||
			(a === 169 && b === 254) ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 0 && (c === 0 || c === 2)) ||
			(a === 192 && b === 168) ||
			(a === 198 && (b === 18 || b === 19)) ||
			(a === 198 && b === 51 && c === 100) ||
			(a === 203 && b === 0 && c === 113) ||
			a >= 224
		);
	}
	if (isIP(normalized) !== 6) return false;
	if (normalized === "::" || normalized === "::1") return false;
	if (/^f[cd]/.test(normalized) || /^fe[89ab]/.test(normalized)) return false;
	if (/^ff/.test(normalized)) return false;
	if (/^2001:db8(?::|$)/.test(normalized)) return false;
	const mapped = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	return mapped ? isPublicAddress(mapped) : true;
}

export const resolveHost: HostResolver = async (hostname) =>
	(await lookup(hostname, { all: true, verbatim: true })).map(
		(record) => record.address,
	);

function explicitPort(value: string) {
	const authority = value.match(/^[a-z]+:\/\/([^/?#]+)/i)?.[1] ?? "";
	return (
		authority
			.match(/\]:(\d+)$|:(\d+)$/)
			?.slice(1)
			.find(Boolean) ?? ""
	);
}

export async function validateCustomDestinationForStorage(
	value: string,
	resolver: HostResolver = resolveHost,
) {
	if (value.length > 4096 || hasUnsafeCharacters(value)) invalid();
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		invalid();
	}
	const protocol = url.protocol.slice(0, -1) as CustomDirectProtocol;
	if (
		!CUSTOM_DIRECT_PROTOCOLS.includes(protocol) ||
		url.username ||
		url.password ||
		url.hash ||
		!url.hostname
	) {
		invalid();
	}
	try {
		if (hasUnsafeCharacters(decodeURIComponent(`${url.pathname}${url.search}`)))
			invalid();
	} catch {
		invalid();
	}
	const port = explicitPort(value);
	if (
		((protocol === "rtmp" || protocol === "rtmps") &&
			(!url.pathname || url.pathname === "/")) ||
		(protocol === "srt" &&
			(!port ||
				((!url.pathname || url.pathname === "/") &&
					!url.searchParams.has("streamid"))))
	) {
		invalid();
	}
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	let addresses: string[];
	try {
		addresses = isIP(hostname) ? [hostname] : await resolver(hostname);
	} catch {
		invalid();
	}
	if (
		!addresses.length ||
		addresses.some((address) => !isPublicAddress(address))
	) {
		invalid();
	}
	return {
		protocol,
		endpointSummary: `${protocol}://${url.hostname}${port ? `:${port}` : ""}`,
	};
}
