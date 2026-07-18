import { type ChatPreferences, parseChatPreferences } from "./chat-model";
import { storage } from "./storage";

export * from "./chat-model";

function storageKey(userId: string) {
	return `visp.chat.${userId.replace(/[^a-z0-9._-]/gi, "_")}`;
}

export async function loadChatPreferences(userId: string) {
	return parseChatPreferences(await storage.getItem(storageKey(userId)));
}

export async function saveChatPreferences(
	userId: string,
	preferences: ChatPreferences,
) {
	await storage.setItem(storageKey(userId), JSON.stringify(preferences));
}
