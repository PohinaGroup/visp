import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { DIRECT_OCCUPIED_STATES, type DirectState } from "./direct-model";

/** One canonical state set for admission, relay cleanup, and admin counts. */
export const DIRECT_OCCUPIED_STATES_SQL = sql`(${sql.join(
	DIRECT_OCCUPIED_STATES.map((state) => sql`${state}`),
	sql`, `,
)})`;

/**
 * The reservation left once the relay reports a forwarder gone. A stopped
 * report can land after the reconnecting publisher already minted a fresh
 * reservation (the old forwarder winds down after the drop), so stopped only
 * releases a lapsed one. A failure is this attempt's own verdict and frees
 * the slot at once.
 */
export function releasedReservation(column: AnyPgColumn, state: DirectState) {
	return state === "stopped"
		? sql`case when ${column} > now() then ${column} else null end`
		: null;
}
