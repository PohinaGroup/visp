import { db } from "@VISP/db";
import {
	account,
	pathState,
	relayPath,
	relayStreamSession,
} from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, eq, isNotNull, isNull, min, ne, sql } from "drizzle-orm";
import { defaultHelix, helixUser } from "../chat/moderator";
import { publicProcedure, router } from "../index";

export type LiveSummary = {
	/** When the showcase channel's current broadcast went live, or null. */
	onAirSince: string | null;
	/** Broadcasters currently live on Twitch through Direct, by Twitch login. */
	channels: { login: string; displayName: string }[];
	/** Every device publishing right now, whatever its output. */
	liveNow: number;
};

const SUMMARY_TTL_MS = 15_000;
const LOGIN_TTL_MS = 60 * 60 * 1000;
const MAX_SHOUTOUTS = 24;

let summary: { value: Promise<LiveSummary>; expiresAt: number } | undefined;
const logins = new Map<
	string,
	{ value: { login: string; displayName: string } | null; expiresAt: number }
>();

/** Published within the last minute, same rule as the admin overview. */
const publishingNow = and(
	eq(pathState.publishing, true),
	sql`${pathState.lastEventAt} >= now() - interval '60 seconds'`,
);

async function loadSummary(): Promise<LiveSummary> {
	const bot = env.VISP_CHAT_BOT_USER_ID;
	const [[onAir], [count], liveUsers, botAccount] = await Promise.all([
		db
			.select({ since: min(relayStreamSession.firstLiveAt) })
			.from(relayStreamSession)
			.innerJoin(relayPath, eq(relayPath.id, relayStreamSession.pathId))
			.where(
				and(
					eq(relayPath.userId, bot),
					isNull(relayStreamSession.endedAt),
					isNotNull(relayStreamSession.firstLiveAt),
				),
			),
		db
			.select({ liveNow: sql<number>`count(*)::int` })
			.from(pathState)
			.where(publishingNow),
		db
			.selectDistinct({ twitchId: account.accountId })
			.from(pathState)
			.innerJoin(relayPath, eq(relayPath.id, pathState.pathId))
			.innerJoin(
				account,
				and(
					eq(account.userId, relayPath.userId),
					eq(account.providerId, "twitch"),
				),
			)
			.where(
				and(
					publishingNow,
					eq(pathState.directTwitchState, "live"),
					ne(relayPath.userId, bot),
				),
			)
			.limit(MAX_SHOUTOUTS),
		db.query.account.findFirst({
			columns: { accountId: true },
			where: and(eq(account.userId, bot), eq(account.providerId, "twitch")),
		}),
	]);

	const channels: LiveSummary["channels"] = [];
	if (botAccount) {
		const helix = defaultHelix(botAccount.accountId);
		const now = Date.now();
		// ponytail: one Helix call per channel, cached an hour; batch
		// `users?id=` if shoutouts ever approach the hundred-id limit.
		await Promise.all(
			liveUsers.map(async ({ twitchId }) => {
				let entry = logins.get(twitchId);
				if (!entry || entry.expiresAt < now) {
					entry = {
						value: await helixUser(helix, twitchId).catch(() => null),
						expiresAt: now + LOGIN_TTL_MS,
					};
					logins.set(twitchId, entry);
				}
				if (entry.value) channels.push(entry.value);
			}),
		);
		channels.sort((a, b) => a.login.localeCompare(b.login));
	}

	return {
		onAirSince: onAir?.since?.toISOString() ?? null,
		channels,
		liveNow: count?.liveNow ?? 0,
	};
}

/** Public and unauthenticated: one DB round per TTL, whatever the poll rate. */
export function liveSummary() {
	const now = Date.now();
	if (!summary || summary.expiresAt < now) {
		const value = loadSummary();
		summary = { value, expiresAt: now + SUMMARY_TTL_MS };
		value.catch(() => {
			summary = undefined;
		});
	}
	return summary.value;
}

export const liveRouter = router({
	summary: publicProcedure.query(() => liveSummary()),
});
