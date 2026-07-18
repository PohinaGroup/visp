import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

export {
	describeStreamUrl,
	parsePublishCredentials,
	selectPublishUrl,
	validateStreamUrl,
} from "./stream-url-validation";

import { validateStreamUrl } from "./stream-url-validation";

const STREAM_URL_KEY = "visp.srt.publish-url";
const STREAM_OWNER_KEY = "visp.srt.owner";
const INSTALLATION_ID_KEY = "visp.publish.installation-id";
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
	keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadStreamUrl(userId: string): Promise<string | null> {
	const [owner, url] = await Promise.all([
		SecureStore.getItemAsync(STREAM_OWNER_KEY, SECURE_STORE_OPTIONS),
		SecureStore.getItemAsync(STREAM_URL_KEY, SECURE_STORE_OPTIONS),
	]);
	return owner === userId ? url : null;
}

export async function loadOrCreateInstallationId(): Promise<string> {
	const existing = await SecureStore.getItemAsync(
		INSTALLATION_ID_KEY,
		SECURE_STORE_OPTIONS,
	);
	if (existing) return existing;
	const created = Crypto.randomUUID();
	await SecureStore.setItemAsync(
		INSTALLATION_ID_KEY,
		created,
		SECURE_STORE_OPTIONS,
	);
	return created;
}

export async function saveStreamUrl(
	value: string,
	userId: string,
): Promise<void> {
	await Promise.all([
		SecureStore.setItemAsync(
			STREAM_URL_KEY,
			validateStreamUrl(value),
			SECURE_STORE_OPTIONS,
		),
		SecureStore.setItemAsync(STREAM_OWNER_KEY, userId, SECURE_STORE_OPTIONS),
	]);
}

export async function deleteStreamUrl(): Promise<void> {
	await Promise.all([
		SecureStore.deleteItemAsync(STREAM_URL_KEY, SECURE_STORE_OPTIONS),
		SecureStore.deleteItemAsync(STREAM_OWNER_KEY, SECURE_STORE_OPTIONS),
	]);
}
