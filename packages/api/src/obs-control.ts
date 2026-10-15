import { isBanActive } from "@VISP/auth/ban";
import { db } from "@VISP/db";
import { appUser, relayPath, relayStreamSession } from "@VISP/db/schema/index";
import { type AnyColumn, and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { recordPlatformLive } from "./activation";
import type {
	ObsCommand,
	ObsStateReportInput,
	ObsStatus,
	ObsToggle,
} from "./obs-live";
import { obsLiveHub } from "./obs-live";
import { createToken, parseToken, tokenMatches } from "./token-secret";

const CONNECTED_FOR_MS = 10_000;
/**
 * A command sent while OBS was away is kept for this long so a plugin that
 * went heartbeat-stale mid-command, or reconnected after a short drop, still
 * picks it up. Beyond it the intent is dropped when OBS next reports: a Go
 * Live pressed hours ago must not start a stream when OBS is opened.
 */
export const OBS_QUEUED_COMMAND_TTL_MS = 5 * 60_000;

export function parseObsControlToken(value: string | undefined) {
	if (!value?.startsWith("Bearer ")) return null;
	return parseToken(value.slice(7));
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
	| "obsMediaSourcesRevision"
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
		mediaSourcesRevision: owner.obsMediaSourcesRevision,
	};
}

/**
 * Tells a connected OBS plugin to refetch the media sources it manages. The
 * revision also rides on every heartbeat reply, so a plugin that misses this
 * push (another app instance, a reconnect) still catches up within seconds.
 */
export async function notifyObsMediaSourcesChanged(userId: string) {
	const [owner] = await db
		.update(appUser)
		.set({
			obsMediaSourcesRevision: sql`${appUser.obsMediaSourcesRevision} + 1`,
		})
		.where(eq(appUser.id, userId))
		.returning();
	if (owner?.obsControlTokenId) {
		obsLiveHub.publishCommand(
			userId,
			owner.obsControlTokenId,
			controlCommand(owner),
		);
	}
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
	const token = createToken();
	const [owner] = await db
		.update(appUser)
		.set({
			obsControlTokenId: token.id,
			obsControlTokenHash: token.hash,
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
	return { token: token.value, status };
}

export async function authenticateObsControlToken(
	authorization: string | undefined,
) {
	const token = parseObsControlToken(authorization);
	if (!token) return null;
	const row = await db.query.appUser.findFirst({
		where: eq(appUser.obsControlTokenId, token.id),
		// A ban revokes this token, but the ban is checked here too (joined, no
		// extra query): a ban written another way, or a token minted while one
		// was committing, must not keep OBS control.
		with: { user: { columns: { banned: true, banExpires: true } } },
	});
	if (!row?.obsControlTokenHash) return null;
	if (!tokenMatches(token.secret, row.obsControlTokenHash)) return null;
	const { user: account, ...owner } = row;
	return account && !isBanActive(account) ? owner : null;
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
	{
		now = Date.now(),
		firstOnConnection = false,
	}: {
		now?: number;
		/** First report on a newly opened OBS WebSocket. */
		firstOnConnection?: boolean;
	} = {},
) {
	const recording = input.recording ?? false;
	const virtualCam = input.virtualCam ?? false;
	const replayBuffer = input.replayBuffer ?? false;
	const recordPaused = input.recordPaused ?? false;
	// OBS has been away longer than a queued command is kept (or was never
	// seen): whatever is still unapplied is expired and the desired flags are
	// reconciled with what OBS reports now.
	const queueExpired = sql`(${appUser.obsLastSeenAt} is null or ${appUser.obsLastSeenAt} < ${new Date(now - OBS_QUEUED_COMMAND_TTL_MS).toISOString()}::timestamptz)`;
	// A plugin keeps its applied version across reconnects, so the first report
	// of a connection at version 0 is a freshly started plugin (OBS relaunched,
	// or the plugin restarted after a settings change). If nothing is pending,
	// the desired flags only mirror what the previous OBS session was doing (a
	// stream that was live when OBS crashed, or whose "stopped" report was lost
	// on shutdown). That report must land so they follow the actual state now,
	// or the reply would carry them back and start that stream again. A command
	// still pending within the TTL is left alone and delivered as before.
	const relaunchedWithNothingPending =
		firstOnConnection && input.appliedVersion === 0
			? sql`${appUser.obsAppliedVersion} >= ${appUser.obsCommandVersion}`
			: sql`false`;
	const appliedVersion = sql<number>`case when ${queueExpired} then ${appUser.obsCommandVersion} else greatest(${appUser.obsAppliedVersion}, least(${input.appliedVersion}, ${appUser.obsCommandVersion})) end`;
	// Once the plugin has caught up, each desired flag follows the reported
	// actual so a manual change in OBS is never fought (same idea as the scene).
	// Streaming included: a stream stopped from OBS (or by closing OBS) must not
	// stay "wanted" on the server, or the plugin starts it again on next launch.
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
			obsDesiredStreaming: followActual(
				input.streaming,
				appUser.obsDesiredStreaming,
			),
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
				// A report older than one already applied is ignored so it cannot
				// roll the actual state back, but a relaunched OBS reports version 0
				// again: once the queue has expired its report must land, or the
				// expired command is never reconciled and still fires. The same goes
				// for a relaunch with nothing pending, whatever the queue's age.
				or(
					lte(appUser.obsAppliedVersion, input.appliedVersion),
					queueExpired,
					relaunchedWithNothingPending,
				),
			),
		)
		.returning();
	if (!updated) return getObsControlCommand(userId, tokenId);
	// OBS streaming is a live signal like a Direct output's (docs/admin-kpis.md,
	// "OBS-only undercount"). Checked on every report, not only when streaming
	// flips on, so OBS started before the phone connected is caught once the
	// session opens. Only paths with an open session count: OBS streaming
	// without the VISP feed is not a VISP stream. recordPlatformLive's isNull
	// guards keep repeat reports idempotent.
	if (input.streaming) {
		const candidates = await db
			.select({ pathId: relayStreamSession.pathId })
			.from(relayStreamSession)
			.innerJoin(relayPath, eq(relayPath.id, relayStreamSession.pathId))
			.where(
				and(
					eq(relayPath.userId, userId),
					isNull(relayStreamSession.endedAt),
					isNull(relayStreamSession.firstLiveAt),
				),
			);
		for (const { pathId } of candidates) {
			await recordPlatformLive(userId, pathId, "obs");
		}
	}
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
