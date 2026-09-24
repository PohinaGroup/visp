import { db } from "@VISP/db";
import { multiChatOverlay } from "@VISP/db/schema/index";
import { eq } from "drizzle-orm";
import { createToken, parseToken, tokenMatches } from "../token-secret";
import { multiChatHub } from "./hub";

export function parseMultiChatOverlayToken(value: string | undefined) {
	return parseToken(value);
}

export async function issueMultiChatOverlayToken(userId: string) {
	const token = createToken();
	await db
		.insert(multiChatOverlay)
		.values({ userId, tokenId: token.id, tokenHash: token.hash })
		.onConflictDoUpdate({
			target: multiChatOverlay.userId,
			set: { tokenId: token.id, tokenHash: token.hash, updatedAt: new Date() },
		});
	multiChatHub.revoke(userId);
	return { token: token.value };
}

export async function multiChatOverlayTokenStatus(userId: string) {
	const row = await db.query.multiChatOverlay.findFirst({
		where: eq(multiChatOverlay.userId, userId),
	});
	return { configured: Boolean(row?.tokenId) };
}

export async function revokeMultiChatOverlayToken(userId: string) {
	const result = await db
		.update(multiChatOverlay)
		.set({ tokenId: null, tokenHash: null })
		.where(eq(multiChatOverlay.userId, userId))
		.returning({ userId: multiChatOverlay.userId });
	if (result[0]) multiChatHub.revoke(userId);
	return Boolean(result[0]);
}

export async function authenticateMultiChatOverlayToken(
	raw: string | undefined,
) {
	const token = parseMultiChatOverlayToken(raw);
	if (!token) return null;
	const row = await db.query.multiChatOverlay.findFirst({
		where: eq(multiChatOverlay.tokenId, token.id),
	});
	if (!row?.tokenHash) return null;
	return tokenMatches(token.secret, row.tokenHash) ? row.userId : null;
}
