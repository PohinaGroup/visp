import { db } from "@VISP/db";
import { relay } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { DIRECT_OCCUPIED_STATES_SQL } from "./direct-occupancy";

type DbExecutor = Pick<typeof db, "execute">;
type RelayCandidate = {
	apiUrl: string;
	host: string;
	id: number;
	maxForwarders: number;
	pingUrl: string;
};

// Used for both assignment and offline moves. BRB, stopping, reservations,
// portrait and custom outputs all keep a Direct session on its relay.
export function activeDirectRelays(userId: string) {
	return sql`select distinct p.relay_id from path p
		left join path_state s on s.path_id = p.id
		where p.user_id = ${userId} and p.revoked_at is null and (
			s.direct_twitch_state in ${DIRECT_OCCUPIED_STATES_SQL}
			or s.direct_kick_state in ${DIRECT_OCCUPIED_STATES_SQL}
			or s.direct_youtube_state in ${DIRECT_OCCUPIED_STATES_SQL}
			or s.direct_twitch_reserved_until > now()
			or s.direct_kick_reserved_until > now()
			or s.direct_youtube_reserved_until > now()
			or s.brb_since is not null or s.direct_handover_until > now()
			or exists (select 1 from direct_destination d where d.path_id = p.id
				and (d.state in ${DIRECT_OCCUPIED_STATES_SQL} or d.reserved_until > now()))
			or exists (select 1 from custom_direct_output d where d.path_id = p.id
				and (d.state in ${DIRECT_OCCUPIED_STATES_SQL} or d.reserved_until > now()))
		)`;
}

export async function lockRelayAssignments(executor: DbExecutor) {
	// ponytail: serialize rare device allocations; use per-relay locks if this becomes busy.
	await executor.execute(sql`select pg_advisory_xact_lock(71843, 1)`);
}

export async function ensureDefaultRelay() {
	await db
		.insert(relay)
		.values({
			name: "default",
			host: env.RELAY_HOST,
			apiUrl: env.MEDIAMTX_API_URL,
			pingUrl: env.RELAY_PING_URL,
			region: "default",
			capacityPaths: 1_000,
			maxForwarders: env.DIRECT_MAX_FORWARDERS,
			publicIp: "pending",
		})
		.onConflictDoUpdate({
			target: relay.name,
			set: {
				host: env.RELAY_HOST,
				apiUrl: env.MEDIAMTX_API_URL,
				pingUrl: env.RELAY_PING_URL,
				maxForwarders: env.DIRECT_MAX_FORWARDERS,
			},
		});
}

export async function chooseRelay(
	userId: string,
	preferredRelayId?: number,
	executor: DbExecutor = db,
	replacingPathId?: number,
) {
	await lockRelayAssignments(executor);
	const result = await executor.execute(sql<RelayCandidate>`
		with active_direct as (${activeDirectRelays(userId)})
		select
			r.id,
			r.host,
			r.api_url as "apiUrl",
			r.ping_url as "pingUrl",
			r.max_forwarders as "maxForwarders"
		from relay r
		left join path assigned
			on assigned.relay_id = r.id
			and assigned.revoked_at is null
			and assigned.id <> ${replacingPathId ?? -1}
		where r.enabled = true
			and r.drained_at is null
			and (not exists (select 1 from active_direct)
				or r.id in (select relay_id from active_direct))
		group by r.id
		having count(assigned.id) < r.capacity_paths
		order by
			case
				when r.id = ${preferredRelayId ?? -1} then 0
				when exists (
					select 1 from path owned
					where owned.user_id = ${userId}
						and owned.relay_id = r.id
						and owned.revoked_at is null
				) then 1
				else 2
			end,
			count(assigned.id),
			r.id
		limit 1
	`);
	return (result.rows[0] as RelayCandidate | undefined) ?? null;
}

export function listRelaysForProbing() {
	return db
		.select({
			id: relay.id,
			name: relay.name,
			region: relay.region,
			pingUrl: relay.pingUrl,
		})
		.from(relay)
		.where(and(eq(relay.enabled, true), isNull(relay.drainedAt)))
		.orderBy(asc(relay.name));
}
