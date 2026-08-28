import { lookup } from "node:dns/promises";
import {
	isPublicAddress,
	validateBrowserSourceUrl,
} from "../../packages/api/src/studio-browser-url";

type Resolve = (hostname: string) => Promise<string[]>;

const resolveAddresses: Resolve = async (hostname) =>
	(await lookup(hostname, { all: true, verbatim: true })).map(
		({ address }) => address,
	);

export async function validateBrowserRequest(
	value: string,
	allowedHost: string,
	resolve: Resolve = resolveAddresses,
) {
	const url = new URL(value);
	if (url.protocol === "data:" || url.protocol === "blob:") return;
	validateBrowserSourceUrl(value);
	if (url.hostname !== allowedHost)
		throw new Error("Browser subresources must use the pinned widget host");
	const addresses = await resolve(url.hostname.replace(/^\[|\]$/g, ""));
	if (
		!addresses.length ||
		addresses.some((address) => !isPublicAddress(address))
	)
		throw new Error("Browser request must resolve to a public address");
}
