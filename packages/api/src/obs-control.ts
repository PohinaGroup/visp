import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";

const CONNECTED_FOR_MS = 10_000;
const TOKEN_ID_BYTES = 12;
const TOKEN_SECRET_BYTES = 32;

function hashToken(secret: string) {
	return createHash("sha256").update(secret).digest("hex");
}

export function parseObsControlToken(value: string | undefined) {
	if (!value?.startsWith("Bearer ")) return null;
	const [id, secret, extra] = value.slice(7).split(".");
	return !extra &&
		/^[a-f0-9]{24}$/.test(id ?? "") &&
		/^[a-f0-9]{64}$/.test(secret ?? "")
		? { id: id as string, secret: secret as string }
		: null;
}

function controlStatus(owner: typeof appUser.$inferSelect) {
	const connected = Boolean(
		owner.obsLastSeenAt &&
			Date.now() - owner.obsLastSeenAt.getTime() < CONNECTED_FOR_MS,
	);
	return {
		configured: Boolean(owner.obsControlTokenHash),
		connected,
		streaming: owner.obsStreaming,
		desiredStreaming: owner.obsDesiredStreaming,
		scenes: owner.obsScenes,
		currentScene: owner.obsCurrentScene,
		desiredScene: owner.obsDesiredScene,
		pending: owner.obsAppliedVersion < owner.obsCommandVersion,
		lastSeenAt: owner.obsLastSeenAt?.toISOString() ?? null,
	};
}

export async function getObsControlStatus(userId: string) {
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	if (!owner) throw new Error("Relay user not found");
	return controlStatus(owner);
}

export async function rotateObsControlToken(userId: string) {
	const id = randomBytes(TOKEN_ID_BYTES).toString("hex");
	const secret = randomBytes(TOKEN_SECRET_BYTES).toString("hex");
	const hash = hashToken(secret);
	const [owner] = await db
		.update(appUser)
		.set({
			obsControlTokenId: id,
			obsControlTokenHash: hash,
			obsDesiredStreaming: false,
			obsStreaming: false,
			obsScenes: [],
			obsCurrentScene: null,
			obsDesiredScene: null,
			obsCommandVersion: 0,
			obsAppliedVersion: 0,
			obsLastSeenAt: null,
		})
		.where(eq(appUser.id, userId))
		.returning();
	if (!owner) throw new Error("Relay user not found");
	return { token: `${id}.${secret}`, status: controlStatus(owner) };
}

export async function authenticateObsControlToken(
	authorization: string | undefined,
) {
	const token = parseObsControlToken(authorization);
	if (!token) {
		// #region agent log
		fetch(
			"http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Debug-Session-Id": "b39b08",
				},
				body: JSON.stringify({
					sessionId: "b39b08",
					runId: "pre-fix",
					hypothesisId: "C",
					location: "obs-control.ts:authenticate",
					message: "token parse failed",
					data: {
						hasAuthorization: Boolean(authorization),
						startsWithBearer: Boolean(
							authorization?.startsWith("Bearer "),
						),
						rawLen: authorization?.length ?? 0,
					},
					timestamp: Date.now(),
				}),
			},
		).catch(() => {});
		// #endregion
		return null;
	}
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.obsControlTokenId, token.id),
	});
	if (!owner?.obsControlTokenHash) {
		// #region agent log
		fetch(
			"http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Debug-Session-Id": "b39b08",
				},
				body: JSON.stringify({
					sessionId: "b39b08",
					runId: "pre-fix",
					hypothesisId: "D",
					location: "obs-control.ts:authenticate",
					message: "token id not found or hash missing",
					data: {
						idPrefix: token.id.slice(0, 6),
						ownerFound: Boolean(owner),
						hasHash: Boolean(owner?.obsControlTokenHash),
					},
					timestamp: Date.now(),
				}),
			},
		).catch(() => {});
		// #endregion
		return null;
	}
	const providedHash = Buffer.from(hashToken(token.secret), "hex");
	const storedHash = Buffer.from(owner.obsControlTokenHash, "hex");
	const ok =
		storedHash.length === providedHash.length &&
		timingSafeEqual(providedHash, storedHash);
	// #region agent log
	fetch("http://127.0.0.1:7870/ingest/4a199f6b-d731-4d4f-9079-2a4bcd73006c", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Debug-Session-Id": "b39b08",
		},
		body: JSON.stringify({
			sessionId: "b39b08",
			runId: "pre-fix",
			hypothesisId: "D",
			location: "obs-control.ts:authenticate",
			message: ok ? "token hash matched" : "token hash mismatch",
			data: {
				idPrefix: token.id.slice(0, 6),
				userIdPrefix: owner.id.slice(0, 8),
				ok,
			},
			timestamp: Date.now(),
		}),
	}).catch(() => {});
	// #endregion
	return ok ? owner : null;
}

export async function revokeObsControlToken(userId: string) {
	const [owner] = await db
		.update(appUser)
		.set({
			obsControlTokenId: null,
			obsControlTokenHash: null,
			obsDesiredStreaming: false,
			obsStreaming: false,
			obsScenes: [],
			obsCurrentScene: null,
			obsDesiredScene: null,
			obsCommandVersion: 0,
			obsAppliedVersion: 0,
			obsLastSeenAt: null,
		})
		.where(eq(appUser.id, userId))
		.returning();
	return Boolean(owner);
}

export async function setObsStreaming(userId: string, streaming: boolean) {
	const [owner] = await db
		.update(appUser)
		.set({
			obsDesiredStreaming: streaming,
			obsCommandVersion: sql`${appUser.obsCommandVersion} + 1`,
		})
		.where(eq(appUser.id, userId))
		.returning();
	if (!owner) throw new Error("Relay user not found");
	return controlStatus(owner);
}

export async function setObsScene(userId: string, scene: string) {
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	if (!owner) throw new Error("Relay user not found");
	if (!owner.obsScenes.includes(scene)) return null;
	const [updated] = await db
		.update(appUser)
		.set({
			obsDesiredScene: scene,
			obsCommandVersion: sql`${appUser.obsCommandVersion} + 1`,
		})
		.where(eq(appUser.id, userId))
		.returning();
	return updated ? controlStatus(updated) : null;
}

export async function pollObsControl(
	authorization: string | undefined,
	input: {
		appliedVersion: number;
		streaming: boolean;
		scenes: string[];
		currentScene: string | null;
	},
) {
	const owner = await authenticateObsControlToken(authorization);
	if (!owner) return null;

	// ponytail: one heartbeat write per poll is fine for v1; use leases or long-polling when connection count becomes material.
	const appliedVersion = Math.min(
		input.appliedVersion,
		owner.obsCommandVersion,
	);
	const desiredScene =
		appliedVersion >= owner.obsCommandVersion
			? input.currentScene
			: owner.obsDesiredScene;
	const [updated] = await db
		.update(appUser)
		.set({
			obsAppliedVersion: appliedVersion,
			obsStreaming: input.streaming,
			obsScenes: input.scenes,
			obsCurrentScene: input.currentScene,
			obsDesiredScene: desiredScene,
			obsLastSeenAt: new Date(),
		})
		.where(eq(appUser.id, owner.id))
		.returning();
	if (!updated) return null;
	return {
		commandVersion: updated.obsCommandVersion,
		desiredStreaming: updated.obsDesiredStreaming,
		desiredScene: updated.obsDesiredScene,
		pollAfterMs: 2000,
	};
}
