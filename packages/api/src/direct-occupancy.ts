import { sql } from "drizzle-orm";
import { DIRECT_OCCUPIED_STATES } from "./direct-model";

/** One canonical state set for admission, relay cleanup, and admin counts. */
export const DIRECT_OCCUPIED_STATES_SQL = sql`(${sql.join(
	DIRECT_OCCUPIED_STATES.map((state) => sql`${state}`),
	sql`, `,
)})`;
