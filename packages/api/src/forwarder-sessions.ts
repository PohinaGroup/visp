import { db } from "@VISP/db";
import { type SQL, sql } from "drizzle-orm";
import { DIRECT_OCCUPIED_STATES_SQL } from "./direct-occupancy";

type DbExecutor = Pick<typeof db, "execute">;

/**
 * Every forwarder occupying an encoder right now, one row per FFmpeg process.
 * Same definition as admin's "active now": an occupied state on a path that is
 * not revoked. Reservations are excluded on purpose — a reserved slot has no
 * encoder running yet, and counting it would inflate encoder-hours.
 */
function occupiedForwarders(scope: SQL) {
	return sql`
		select p.id as path_id, p.relay_id, managed.destination,
			null::text as destination_ref, 'landscape'::direct_role as role
		from path p
		join path_state s on s.path_id = p.id
		cross join lateral (values
			('twitch', s.direct_twitch_state),
			('kick', s.direct_kick_state),
			('youtube', s.direct_youtube_state)
		) as managed(destination, state)
		where p.revoked_at is null and ${scope}
			and managed.state in ${DIRECT_OCCUPIED_STATES_SQL}
		union all
		select p.id, p.relay_id, d.provider, d.id::text, d.role
		from direct_destination d
		join path p on p.id = d.path_id
		where p.revoked_at is null and ${scope}
			and d.state in ${DIRECT_OCCUPIED_STATES_SQL}
		union all
		select p.id, p.relay_id, 'custom', o.id, o.role
		from custom_direct_output o
		join path p on p.id = o.path_id
		where p.revoked_at is null and ${scope}
			and o.state in ${DIRECT_OCCUPIED_STATES_SQL}
	`;
}

/**
 * Forwarders occupying an encoder on one relay right now, as a scalar
 * subquery. The same rows `forwarder_session` tracks and that Direct's
 * capacity checks count as occupied (legacy provider outputs, portrait
 * destinations and custom outputs), minus reservations: a reserved slot has
 * no encoder running yet. Reusing `occupiedForwarders` keeps relay-health
 * samples, session history and admission from drifting apart.
 */
export function relayOccupiedForwarderCount(relayId: number | SQL) {
	return sql<number>`(
		select count(*)::int
		from (${occupiedForwarders(sql`p.relay_id = ${relayId}`)}) relay_occupied
	)`;
}

/**
 * Makes `forwarder_session` agree with the live Direct state: opens a row for
 * every occupied forwarder that has none and closes every open row whose
 * forwarder is no longer occupied (left the occupied states, or its
 * destination/output row was deleted).
 *
 * Diffing against current state instead of hooking each transition is
 * deliberate: Direct state is written from a dozen places (hooks, BRB ticks,
 * stop paths, reservation resets, row deletes) and an edge-triggered log would
 * drift the first time one of them was missed. This is idempotent, safe to run
 * concurrently (the partial unique index arbitrates duplicate opens), and the
 * same statement serves as the per-path hook update and the global reconciler.
 *
 * @param pathIds restrict to these paths; omit to reconcile every path.
 */
export async function syncForwarderSessions(
	executor: DbExecutor,
	pathIds?: readonly number[],
) {
	if (pathIds && pathIds.length === 0) return;
	const scope = pathIds
		? sql`p.id in (${sql.join(
				pathIds.map((id) => sql`${id}`),
				sql`, `,
			)})`
		: sql`true`;
	const sessionScope = pathIds
		? sql`f.path_id in (${sql.join(
				pathIds.map((id) => sql`${id}`),
				sql`, `,
			)})`
		: sql`true`;
	// The close and the open touch disjoint keys, so one snapshot serves both.
	await executor.execute(sql`
		with occupied as (${occupiedForwarders(scope)}),
		closed as (
			update forwarder_session f
			-- greatest: a row opened by a transaction that started after this one
			-- would otherwise violate the range check.
			set ended_at = greatest(now(), f.started_at)
			where f.ended_at is null and ${sessionScope}
				and not exists (
					select 1 from occupied o
					where o.path_id = f.path_id
						and o.destination = f.destination
						and o.destination_ref is not distinct from f.destination_ref
						and o.role = f.role
				)
			returning f.id
		)
		insert into forwarder_session (path_id, relay_id, destination, destination_ref, role)
		select path_id, relay_id, destination, destination_ref, role from occupied
		on conflict (path_id, destination, (coalesce(destination_ref, '')), role)
			where ended_at is null
			do nothing
	`);
}

/**
 * Called right after a Direct state write for these paths. Session history is
 * analytics: a failure here must never fail the hook that reported a live
 * forwarder, so it is logged and left to the reconciler (≤10 s drift).
 */
export async function recordForwarderTransition(pathIds: readonly number[]) {
	try {
		await syncForwarderSessions(db, pathIds);
	} catch (error) {
		console.error("forwarder session sync failed", { pathIds, error });
	}
}

/**
 * Global pass run by the server's 10 s path reconciler. Catches transitions
 * no hook reported (reservation resets, row deletes, revocations) and, on the
 * first pass after a restart, closes rows left open by a crash. Max drift
 * between a forwarder's real start/stop and its row is one reconciler tick.
 */
export function reconcileForwarderSessions(executor: DbExecutor = db) {
	return syncForwarderSessions(executor);
}
