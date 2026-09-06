import { db } from "@VISP/db";
import { multiChatSource } from "@VISP/db/schema/index";
import { and, eq } from "drizzle-orm";
import { normalizeKickMessage } from "../chat/normalize";
import { multiChatHub } from "./hub";

const seen = new Map<string, number>();
const DEDUPE_MS = 5 * 60_000;

export async function handleMultiChatKickPayload(payload: unknown) {
	if (!payload || typeof payload !== "object") return false;
	const event = payload as { broadcaster?: { user_id?: string | number } };
	const broadcasterId = event.broadcaster?.user_id;
	if (broadcasterId === undefined) return false;
	const sources = await db
		.select({ userId: multiChatSource.userId })
		.from(multiChatSource)
		.where(
			and(
				eq(multiChatSource.provider, "kick"),
				eq(multiChatSource.enabled, true),
				eq(multiChatSource.channelId, String(broadcasterId)),
			),
		);
	if (sources.length === 0) return false;
	const message = normalizeKickMessage(payload);
	if (!message) return false;
	const now = Date.now();
	for (const [id, expiresAt] of seen) if (expiresAt <= now) seen.delete(id);
	if (seen.has(message.id)) return true;
	seen.set(message.id, now + DEDUPE_MS);
	for (const source of sources) {
		multiChatHub.publish(source.userId, {
			type: "message",
			message: {
				id: message.id,
				provider: "kick",
				sentAt: message.sentAt,
				sender: message.sender.name,
				color: message.sender.color,
				text: message.fragments.map((fragment) => fragment.text).join(""),
			},
		});
	}
	return true;
}
