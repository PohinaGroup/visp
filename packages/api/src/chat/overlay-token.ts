import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";

const TOKEN_ID_BYTES = 12;
const TOKEN_SECRET_BYTES = 32;

function hashToken(secret: string) {
	return createHash("sha256").update(secret).digest("hex");
}

/**
 * The overlay token arrives bare in a POST body, not as a `Bearer` header, so
 * `parseObsControlToken` cannot be reused. Same `<id>.<secret>` shape.
 */
export function parseChatOverlayToken(value: string | undefined) {
	if (!value) return null;
	const [id, secret, extra] = value.split(".");
	return !extra &&
		/^[a-f0-9]{24}$/.test(id ?? "") &&
		/^[a-f0-9]{64}$/.test(secret ?? "")
		? { id: id as string, secret: secret as string }
		: null;
}

/** Replaces any existing token. The plaintext exists only in this return value. */
export async function issueChatOverlayToken(userId: string) {
	const id = randomBytes(TOKEN_ID_BYTES).toString("hex");
	const secret = randomBytes(TOKEN_SECRET_BYTES).toString("hex");
	const [owner] = await db
		.update(appUser)
		.set({
			chatOverlayTokenId: id,
			chatOverlayTokenHash: hashToken(secret),
		})
		.where(eq(appUser.id, userId))
		.returning();
	if (!owner) throw new Error("Relay user not found");
	return { token: `${id}.${secret}` };
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
	const providedHash = Buffer.from(hashToken(token.secret), "hex");
	const storedHash = Buffer.from(owner.chatOverlayTokenHash, "hex");
	return storedHash.length === providedHash.length &&
		timingSafeEqual(providedHash, storedHash)
		? owner.id
		: null;
}
