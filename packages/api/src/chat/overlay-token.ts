import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { eq } from "drizzle-orm";
import { createToken, parseToken, tokenMatches } from "../token-secret";

export function parseChatOverlayToken(value: string | undefined) {
	return parseToken(value);
}

/** Replaces any existing token. The plaintext exists only in this return value. */
export async function issueChatOverlayToken(userId: string) {
	const token = createToken();
	const [owner] = await db
		.update(appUser)
		.set({
			chatOverlayTokenId: token.id,
			chatOverlayTokenHash: token.hash,
		})
		.where(eq(appUser.id, userId))
		.returning();
	if (!owner) throw new Error("Relay user not found");
	return { token: token.value };
}

export async function revokeChatOverlayToken(userId: string) {
	const [owner] = await db
		.update(appUser)
		.set({ chatOverlayTokenId: null, chatOverlayTokenHash: null })
		.where(eq(appUser.id, userId))
		.returning();
	return Boolean(owner);
}

export async function chatOverlayTokenStatus(userId: string) {
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	if (!owner) throw new Error("Relay user not found");
	return { configured: Boolean(owner.chatOverlayTokenId) };
}

/** Resolves the owning user id, or null when the token is unknown or revoked. */
export async function authenticateChatOverlayToken(raw: string | undefined) {
	const token = parseChatOverlayToken(raw);
	if (!token) return null;
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.chatOverlayTokenId, token.id),
	});
	if (!owner?.chatOverlayTokenHash) return null;
	return tokenMatches(token.secret, owner.chatOverlayTokenHash)
		? owner.id
		: null;
}
