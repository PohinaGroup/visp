import { db } from "@VISP/db";
import { appUser, relayStreamSession } from "@VISP/db/schema/index";
import { and, eq, isNull } from "drizzle-orm";
import { trackRybbitEvent } from "./rybbit";

/** Count each account and ingest session once, including concurrent platform reports. */
export async function recordPlatformLive(
	userId: string,
	pathId: number,
	provider: string,
) {
	const result = await db.transaction(async (tx) => {
		const first = await tx
			.update(appUser)
			.set({ firstLiveAt: new Date() })
			.where(and(eq(appUser.id, userId), isNull(appUser.firstLiveAt)))
			.returning({ id: appUser.id });
		const sessions = await tx
			.update(relayStreamSession)
			.set({ firstLiveAt: new Date() })
			.where(
				and(
					eq(relayStreamSession.pathId, pathId),
					isNull(relayStreamSession.endedAt),
					isNull(relayStreamSession.firstLiveAt),
				),
			)
			.returning({ id: relayStreamSession.id });
		return { first: first.length > 0, session: sessions[0] };
	});
	// The database is authoritative. Analytics delivery is best effort.
	if (result.first) trackRybbitEvent("first_live", { provider });
	if (result.session)
		trackRybbitEvent("stream_live", { provider, sessionId: result.session.id });
	return result.first;
}
