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

export type PausedRequest = {
	requestId: string;
	request: { url: string };
	resourceType?: string;
	frameId?: string;
};

/**
 * Gate one `Fetch.requestPaused` event. Anything off policy is failed with
 * `BlockedByClient` so the page keeps rendering without it (an analytics
 * script, a CDN font, a widget). Only a blocked top-level navigation is
 * fatal to the layer; that error is returned for `capture()` to raise.
 */
export async function gateBrowserRequest(
	event: PausedRequest,
	allowedHost: string,
	mainFrameId: string,
	command: (method: string, params?: object) => Promise<unknown>,
	resolve?: Resolve,
): Promise<Error | undefined> {
	try {
		await validateBrowserRequest(event.request.url, allowedHost, resolve);
	} catch (error) {
		await command("Fetch.failRequest", {
			requestId: event.requestId,
			errorReason: "BlockedByClient",
		}).catch(() => undefined);
		if (event.resourceType !== "Document" || event.frameId !== mainFrameId)
			return;
		return error instanceof Error
			? error
			: new Error("browser request blocked");
	}
	await command("Fetch.continueRequest", { requestId: event.requestId }).catch(
		() => undefined,
	);
}
