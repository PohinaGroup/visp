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

/** Expands any textual IPv6 (compressed, dotted tail, zone) to 8 hextets. */
function ipv6Hextets(address: string): number[] | null {
	let text = address.replace(/%.*$/, "");
	const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
	if (dotted) {
		const parts = ipv4Parts(dotted);
		if (!parts) return null;
		const [a = 0, b = 0, c = 0, d = 0] = parts;
		text = `${text.slice(0, -dotted.length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
	}
	const halves = text.split("::");
	if (halves.length > 2) return null;
	const parse = (half: string | undefined) =>
		half ? half.split(":").map((group) => Number.parseInt(group, 16)) : [];
	const head = parse(halves[0]);
	const tail = parse(halves[1]);
	const fill = 8 - head.length - tail.length;
	if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
	const hextets = [
		...head,
		...Array<number>(Math.max(fill, 0)).fill(0),
		...tail,
	];
	return hextets.every((value) => value >= 0 && value <= 0xffff)
		? hextets
		: null;
}

function embeddedIpv4(high: number, low: number) {
	return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
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
	// Classify on the numeric form: text checks miss spellings such as
	// ::ffff:7f00:1 or 0:0:0:0:0:ffff:7f00:1 for 127.0.0.1.
	const h = ipv6Hextets(normalized);
	if (!h) return false;
	const [h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0] = h;
	const v4 = embeddedIpv4(h6, h7);
	if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0) {
		// ::/128, ::1, IPv4-compatible ::a.b.c.d, mapped ::ffff:a.b.c.d and
		// SIIT ::ffff:0:a.b.c.d all reach the embedded IPv4 (or nothing).
		if (h4 === 0 && h5 === 0) {
			return h6 === 0 && h7 <= 1 ? false : isPublicAddress(v4);
		}
		if (h4 === 0 && h5 === 0xffff) return isPublicAddress(v4);
		if (h4 === 0xffff && h5 === 0) return isPublicAddress(v4);
		return false;
	}
	// NAT64 well-known prefix 64:ff9b::/96 translates to the embedded IPv4;
	// the local-use 64:ff9b:1::/48 goes to operator-chosen space.
	if (h0 === 0x64 && h1 === 0xff9b) {
		return h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0
			? isPublicAddress(v4)
			: false;
	}
	// 6to4 2002::/16 carries its IPv4 in hextets 1–2.
	if (h0 === 0x2002) return isPublicAddress(embeddedIpv4(h1, h2));
	if ((h0 & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
	if ((h0 & 0xffc0) === 0xfe80) return false; // fe80::/10 link local
	if ((h0 & 0xffc0) === 0xfec0) return false; // fec0::/10 old site local
	if ((h0 & 0xff00) === 0xff00) return false; // ff00::/8 multicast
	if (h0 === 0x2001 && h1 === 0x0db8) return false; // documentation
	return true;
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
