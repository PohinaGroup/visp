export {
	describeStreamUrl,
	parsePublishCredentials,
	selectPublishUrl,
	validateStreamUrl,
} from "./stream-url-validation";

import { validateStreamUrl } from "./stream-url-validation";

const INSTALLATION_ID_KEY = "visp.publish.installation-id";
let savedUrl: { owner: string; value: string } | undefined;

export async function loadStreamUrl(userId: string): Promise<string | null> {
	return savedUrl?.owner === userId ? savedUrl.value : null;
}

export async function loadOrCreateInstallationId(): Promise<string> {
	const existing =
		typeof localStorage === "undefined"
			? null
			: localStorage.getItem(INSTALLATION_ID_KEY);
	if (existing) return existing;
	const created = globalThis.crypto.randomUUID();
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(INSTALLATION_ID_KEY, created);
	}
	return created;
}

export async function saveStreamUrl(
	value: string,
	userId: string,
): Promise<void> {
	savedUrl = { owner: userId, value: validateStreamUrl(value) };
}

export async function deleteStreamUrl(): Promise<void> {
	savedUrl = undefined;
}
