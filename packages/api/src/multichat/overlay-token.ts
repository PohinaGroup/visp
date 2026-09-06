import { db } from "@VISP/db";
import { multiChatOverlay } from "@VISP/db/schema/index";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { multiChatHub } from "./hub";

const TOKEN_ID_BYTES = 12;
const TOKEN_SECRET_BYTES = 32;

function hashToken(secret: string) {
	return createHash("sha256").update(secret).digest("hex");
}

export function parseMultiChatOverlayToken(value: string | undefined) {
	if (!value) return null;
	const [id, secret, extra] = value.split(".");
	return !extra &&
		/^[a-f0-9]{24}$/.test(id ?? "") &&
		/^[a-f0-9]{64}$/.test(secret ?? "")
		? { id: id as string, secret: secret as string }
		: null;
}

export async function issueMultiChatOverlayToken(userId: string) {
	const id = randomBytes(TOKEN_ID_BYTES).toString("hex");
	const secret = randomBytes(TOKEN_SECRET_BYTES).toString("hex");
	await db
		.insert(multiChatOverlay)
		.values({ userId, tokenId: id, tokenHash: hashToken(secret) })
		.onConflictDoUpdate({
			target: multiChatOverlay.userId,
			set: { tokenId: id, tokenHash: hashToken(secret), updatedAt: new Date() },
		});
	multiChatHub.revoke(userId);
	return { token: `${id}.${secret}` };
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
	const given = Buffer.from(hashToken(token.secret), "hex");
	const stored = Buffer.from(row.tokenHash, "hex");
	return stored.length === given.length && timingSafeEqual(stored, given)
		? row.userId
		: null;
}
