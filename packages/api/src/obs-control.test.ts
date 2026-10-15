import "./test-env";

import { db } from "@VISP/db";
import {
	appUser,
	relay,
	relayPath,
	relayStreamSession,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	obsControlStatus,
	parseObsControlToken,
	reportObsControlState,
} from "./obs-control";
import { ensureDefaultRelay } from "./relays";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

describe("OBS control token", () => {
	test("accepts only the exact bearer token shape", () => {
		const id = "a".repeat(24);
		const secret = "b".repeat(64);
		expect(parseObsControlToken(`Bearer ${id}.${secret}`)).toEqual({
			id,
			secret,
		});
		expect(parseObsControlToken(`${id}.${secret}`)).toBeNull();
		expect(parseObsControlToken(`Bearer ${id}.${secret}.extra`)).toBeNull();
		expect(parseObsControlToken("Bearer ../bad")).toBeNull();
	});
});

describe("OBS control status", () => {
	test("includes connection expiry and command versions", () => {
		const lastSeenAt = new Date("2026-07-26T12:00:00.000Z");
		const row = {
			obsControlTokenHash: "hash",
			obsDesiredStreaming: true,
			obsStreaming: false,
			obsDesiredRecording: true,
			obsRecording: false,
			obsDesiredVirtualCam: false,
			obsVirtualCam: false,
			obsDesiredReplayBuffer: false,
			obsReplayBuffer: false,
			obsDesiredRecordPaused: false,
			obsRecordPaused: false,
			obsScenes: ["Main"],
			obsCurrentScene: "Main",
			obsDesiredScene: null,
			obsCommandVersion: 3,
			obsAppliedVersion: 2,
			obsLastSeenAt: lastSeenAt,
			obsMediaSourcesRevision: 0,
		};
		expect(obsControlStatus(row, lastSeenAt.getTime() + 9_999)).toEqual({
			configured: true,
			connected: true,
			connectedUntil: "2026-07-26T12:00:10.000Z",
			streaming: false,
			desiredStreaming: true,
			recording: false,
			desiredRecording: true,
			virtualCam: false,
			desiredVirtualCam: false,
			replayBuffer: false,
			desiredReplayBuffer: false,
			recordPaused: false,
			desiredRecordPaused: false,
			scenes: ["Main"],
			currentScene: "Main",
			desiredScene: null,
			pending: true,
			lastSeenAt: "2026-07-26T12:00:00.000Z",
			commandVersion: 3,
			appliedVersion: 2,
		});
		expect(obsControlStatus(row, lastSeenAt.getTime() + 10_000).connected).toBe(
			false,
		);
	});
});

integration("OBS streaming report records live", () => {
	const USER = "obs-control-live-user";
	const TOKEN = "obs-control-live-token";
	let pathId = 0;
	const report = (streaming: boolean) =>
		reportObsControlState(USER, TOKEN, {
			appliedVersion: 0,
			streaming,
			scenes: ["Main"],
			currentScene: "Main",
		});
	const firstLive = async () => {
		const [row] = await db
			.select({ firstLiveAt: relayStreamSession.firstLiveAt })
			.from(relayStreamSession)
			.where(eq(relayStreamSession.pathId, pathId));
		const owner = await db.query.appUser.findFirst({
			where: eq(appUser.id, USER),
		});
		return { session: row?.firstLiveAt ?? null, user: owner?.firstLiveAt };
	};

	beforeAll(async () => {
		await db.delete(user).where(eq(user.id, USER));
		await ensureDefaultRelay();
		const defaultRelay = await db.query.relay.findFirst({
			where: eq(relay.name, "default"),
		});
		if (!defaultRelay) throw new Error("default test relay was not created");
		await db.insert(user).values({
			id: USER,
			name: USER,
			email: `${USER}@example.test`,
		});
		await db.insert(appUser).values({
			id: USER,
			handle: USER,
			obsControlTokenId: TOKEN,
			obsControlTokenHash: "hash",
		});
		const [path] = await db
			.insert(relayPath)
			.values({
				relayId: defaultRelay.id,
				userId: USER,
				seq: 1,
				slug: `${USER}-1`,
				label: "main",
			})
			.returning();
		if (!path) throw new Error("test path was not created");
		pathId = path.id;
		await db.insert(relayStreamSession).values({ pathId });
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, USER));
	});

	test("sets first_live_at once, only while streaming", async () => {
		await report(false);
		expect(await firstLive()).toEqual({ session: null, user: null });

		await report(true);
		const first = await firstLive();
		expect(first.session).toBeInstanceOf(Date);
		expect(first.user).toBeInstanceOf(Date);

		await new Promise((resolve) => setTimeout(resolve, 5));
		await report(true);
		expect(await firstLive()).toEqual(first);
	});
});
