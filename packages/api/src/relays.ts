import { db } from "@VISP/db";
import { relay } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

type DbExecutor = Pick<typeof db, "execute">;
type RelayCandidate = {
	apiUrl: string;
	host: string;
	id: number;
	maxForwarders: number;
	pingUrl: string;
};

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
) {
	const result = await executor.execute(sql<RelayCandidate>`
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
		where r.enabled = true
			and r.drained_at is null
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
