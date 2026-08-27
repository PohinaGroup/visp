import { isIP } from "node:net";

const PRIVATE_V4 = [
	/^0\./,
	/^10\./,
	/^100\.(6[4-9]|[789]\d|1[01]\d|12[0-7])\./,
	/^127\./,
	/^169\.254\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^198\.(1[89])\./,
	/^(22[4-9]|23\d|24\d|25[0-5])\./,
];

export function isPublicAddress(value: string) {
	const address = value.toLowerCase().replace(/^\[|\]$/g, "");
	const mappedV4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
	if (mappedV4) return isPublicAddress(mappedV4);
	if (isIP(address) === 4)
		return !PRIVATE_V4.some((pattern) => pattern.test(address));
	// Public IPv6 sources use global-unicast space. Keeping the allow-list narrow
	// also rejects loopback, link-local, unique-local, mapped, and multicast IPs.
	if (isIP(address) === 6)
		return address.startsWith("2") || address.startsWith("3");
	return false;
}

export function validateBrowserSourceUrl(value: string) {
	const url = new URL(value);
	const host = url.hostname.toLowerCase().replace(/\.$/, "");
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local") ||
		(isIP(host.replace(/^\[|\]$/g, "")) !== 0 && !isPublicAddress(host))
	)
		throw new Error("Browser source must be a public HTTPS URL");
	return url.toString();
}
