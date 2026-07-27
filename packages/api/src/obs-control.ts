import { db } from "@VISP/db";
import { appUser } from "@VISP/db/schema/index";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { type AnyColumn, and, eq, lte, sql } from "drizzle-orm";
import type {
	ObsCommand,
	ObsStateReportInput,
	ObsStatus,
	ObsToggle,
} from "./obs-live";
import { obsLiveHub } from "./obs-live";

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

type ObsControlRow = Pick<
	typeof appUser.$inferSelect,
	| "obsControlTokenHash"
	| "obsDesiredStreaming"
	| "obsStreaming"
	| "obsDesiredRecording"
	| "obsRecording"
	| "obsDesiredVirtualCam"
	| "obsVirtualCam"
	| "obsDesiredReplayBuffer"
	| "obsReplayBuffer"
	| "obsDesiredRecordPaused"
	| "obsRecordPaused"
	| "obsScenes"
	| "obsCurrentScene"
	| "obsDesiredScene"
	| "obsCommandVersion"
	| "obsAppliedVersion"
	| "obsLastSeenAt"
>;

// The appUser "desired" column each toggle writes to.
const TOGGLE_DESIRED_KEY = {
	recording: "obsDesiredRecording",
	virtualCam: "obsDesiredVirtualCam",
	replayBuffer: "obsDesiredReplayBuffer",
	recordPaused: "obsDesiredRecordPaused",
} as const satisfies Record<ObsToggle, keyof typeof appUser.$inferInsert>;

// Columns reset to their standby values when a token is issued or revoked.
const TOGGLE_RESET = {
	obsDesiredRecording: false,
	obsRecording: false,
	obsDesiredVirtualCam: false,
	obsVirtualCam: false,
	obsDesiredReplayBuffer: false,
	obsReplayBuffer: false,
	obsDesiredRecordPaused: false,
	obsRecordPaused: false,
} as const;

export function obsControlStatus(
	owner: ObsControlRow,
	now = Date.now(),
): ObsStatus {
	const connectedUntil = owner.obsLastSeenAt
		? new Date(owner.obsLastSeenAt.getTime() + CONNECTED_FOR_MS).toISOString()
		: null;
	const connected = Boolean(
		owner.obsLastSeenAt &&
			now < owner.obsLastSeenAt.getTime() + CONNECTED_FOR_MS,
	);
	return {
		configured: Boolean(owner.obsControlTokenHash),
		connected,
		connectedUntil,
		streaming: owner.obsStreaming,
		desiredStreaming: owner.obsDesiredStreaming,
		recording: owner.obsRecording,
		desiredRecording: owner.obsDesiredRecording,
		virtualCam: owner.obsVirtualCam,
		desiredVirtualCam: owner.obsDesiredVirtualCam,
		replayBuffer: owner.obsReplayBuffer,
		desiredReplayBuffer: owner.obsDesiredReplayBuffer,
		recordPaused: owner.obsRecordPaused,
		desiredRecordPaused: owner.obsDesiredRecordPaused,
		scenes: owner.obsScenes,
		currentScene: owner.obsCurrentScene,
		desiredScene: owner.obsDesiredScene,
		pending: owner.obsAppliedVersion < owner.obsCommandVersion,
		lastSeenAt: owner.obsLastSeenAt?.toISOString() ?? null,
		commandVersion: owner.obsCommandVersion,
		appliedVersion: owner.obsAppliedVersion,
	};
}

function controlCommand(owner: ObsControlRow): ObsCommand {
	return {
		commandVersion: owner.obsCommandVersion,
		desiredStreaming: owner.obsDesiredStreaming,
		desiredRecording: owner.obsDesiredRecording,
		desiredVirtualCam: owner.obsDesiredVirtualCam,
		desiredReplayBuffer: owner.obsDesiredReplayBuffer,
		desiredRecordPaused: owner.obsDesiredRecordPaused,
		desiredScene: owner.obsDesiredScene,
	};
}

export async function getObsControlStatus(userId: string) {
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.id, userId),
	});
	if (!owner) throw new Error("Relay user not found");
	return obsControlStatus(owner);
}

export async function getObsControlCommand(userId: string, tokenId: string) {
	const owner = await db.query.appUser.findFirst({
		where: and(eq(appUser.id, userId), eq(appUser.obsControlTokenId, tokenId)),
	});
	return owner ? controlCommand(owner) : null;
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
			...TOGGLE_RESET,
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
	const status = obsControlStatus(owner);
	obsLiveHub.publishStatus(userId, status);
	return { token: `${id}.${secret}`, status };
}

export async function authenticateObsControlToken(
	authorization: string | undefined,
) {
	const token = parseObsControlToken(authorization);
	if (!token) return null;
	const owner = await db.query.appUser.findFirst({
		where: eq(appUser.obsControlTokenId, token.id),
	});
	if (!owner?.obsControlTokenHash) return null;
	const providedHash = Buffer.from(hashToken(token.secret), "hex");
	const storedHash = Buffer.from(owner.obsControlTokenHash, "hex");
	return storedHash.length === providedHash.length &&
		timingSafeEqual(providedHash, storedHash)
		? owner
		: null;
}

export async function revokeObsControlToken(userId: string) {
	const [owner] = await db
		.update(appUser)
		.set({
			obsControlTokenId: null,
			obsControlTokenHash: null,
			obsDesiredStreaming: false,
			obsStreaming: false,
			...TOGGLE_RESET,
			obsScenes: [],
			obsCurrentScene: null,
			obsDesiredScene: null,
			obsCommandVersion: 0,
			obsAppliedVersion: 0,
			obsLastSeenAt: null,
		})
		.where(eq(appUser.id, userId))
		.returning();
	if (owner) obsLiveHub.publishStatus(userId, obsControlStatus(owner));
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
	const status = obsControlStatus(owner);
	obsLiveHub.publishStatus(userId, status);
	if (owner.obsControlTokenId) {
		obsLiveHub.publishCommand(
			userId,
			owner.obsControlTokenId,
			controlCommand(owner),
		);
	}
	return status;
}

export async function setObsScene(userId: string, scene: string) {
	const [updated] = await db
		.update(appUser)
		.set({
			obsDesiredScene: scene,
			obsCommandVersion: sql`${appUser.obsCommandVersion} + 1`,
		})
		.where(
			and(eq(appUser.id, userId), sql`${scene} = any(${appUser.obsScenes})`),
		)
		.returning();
	if (!updated) return null;
	const status = obsControlStatus(updated);
	obsLiveHub.publishStatus(userId, status);
	if (updated.obsControlTokenId) {
		obsLiveHub.publishCommand(
			userId,
			updated.obsControlTokenId,
			controlCommand(updated),
		);
	}
	return status;
}

export async function setObsToggle(
	userId: string,
	toggle: ObsToggle,
	on: boolean,
) {
	const [owner] = await db
		.update(appUser)
		.set({
			[TOGGLE_DESIRED_KEY[toggle]]: on,
			obsCommandVersion: sql`${appUser.obsCommandVersion} + 1`,
		})
		.where(eq(appUser.id, userId))
		.returning();
	if (!owner) throw new Error("Relay user not found");
	const status = obsControlStatus(owner);
	obsLiveHub.publishStatus(userId, status);
	if (owner.obsControlTokenId) {
		obsLiveHub.publishCommand(
			userId,
			owner.obsControlTokenId,
			controlCommand(owner),
		);
	}
	return status;
}

export async function reportObsControlState(
	userId: string,
	tokenId: string,
	input: ObsStateReportInput,
) {
	const recording = input.recording ?? false;
	const virtualCam = input.virtualCam ?? false;
	const replayBuffer = input.replayBuffer ?? false;
	const recordPaused = input.recordPaused ?? false;
	const appliedVersion = sql<number>`greatest(${appUser.obsAppliedVersion}, least(${input.appliedVersion}, ${appUser.obsCommandVersion}))`;
	// Once the plugin has caught up, each desired flag follows the reported
	// actual so a manual change in OBS is never fought (same idea as the scene).
	const applied = sql`${appliedVersion} >= ${appUser.obsCommandVersion}`;
	const followActual = (reported: boolean, current: AnyColumn) =>
		sql<boolean>`case when ${applied} then ${reported} else ${current} end`;
	const desiredScene = sql<
		string | null
	>`case when ${applied} then ${input.currentScene} else ${appUser.obsDesiredScene} end`;
	const [updated] = await db
		.update(appUser)
		.set({
			obsAppliedVersion: appliedVersion,
			obsStreaming: input.streaming,
			obsRecording: recording,
			obsDesiredRecording: followActual(recording, appUser.obsDesiredRecording),
			obsVirtualCam: virtualCam,
			obsDesiredVirtualCam: followActual(
				virtualCam,
				appUser.obsDesiredVirtualCam,
			),
			obsReplayBuffer: replayBuffer,
			obsDesiredReplayBuffer: followActual(
				replayBuffer,
				appUser.obsDesiredReplayBuffer,
			),
			obsRecordPaused: recordPaused,
			obsDesiredRecordPaused: followActual(
				recordPaused,
				appUser.obsDesiredRecordPaused,
			),
			obsScenes: input.scenes,
			obsCurrentScene: input.currentScene,
			obsDesiredScene: desiredScene,
			obsLastSeenAt: new Date(),
		})
		.where(
			and(
				eq(appUser.id, userId),
				eq(appUser.obsControlTokenId, tokenId),
				lte(appUser.obsAppliedVersion, input.appliedVersion),
			),
		)
		.returning();
	if (!updated) return getObsControlCommand(userId, tokenId);
	obsLiveHub.publishStatus(userId, obsControlStatus(updated));
	return controlCommand(updated);
}

export async function pollObsControl(
	authorization: string | undefined,
	input: ObsStateReportInput,
) {
	const owner = await authenticateObsControlToken(authorization);
	if (!owner?.obsControlTokenId) return null;
	const command = await reportObsControlState(
		owner.id,
		owner.obsControlTokenId,
		input,
	);
	return command ? { ...command, pollAfterMs: 2000 } : null;
}
