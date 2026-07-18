import { storage } from "./storage";
import {
	parseStreamInfoDraft,
	type StreamInfoDraft,
} from "./stream-info-model";

export * from "./stream-info-model";

function storageKey(userId: string) {
	return `visp.streaminfo.${userId.replace(/[^a-z0-9._-]/gi, "_")}`;
}

export async function loadStreamInfoDraft(userId: string) {
	return parseStreamInfoDraft(await storage.getItem(storageKey(userId)));
}

export async function saveStreamInfoDraft(
	userId: string,
	draft: StreamInfoDraft,
) {
	await storage.setItem(storageKey(userId), JSON.stringify(draft));
}
