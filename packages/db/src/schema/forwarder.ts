import { sql } from "drizzle-orm";
import {
	bigint,
	bigserial,
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

import { directRole, relay, relayPath } from "./relay";

/**
 * One row per stretch of time a Direct forwarder (one FFmpeg encode against
 * the relay's encoder cap) was occupied. The live state columns only say what
 * is running *now*; this keeps the history admin needs for encoder-hours and
 * peak-concurrency charts. Rows are opened and closed by
 * `syncForwarderSessions` in packages/api, never written by hand.
 */
export const forwarderSession = pgTable(
	"forwarder_session",
	{
		id: bigserial("id", { mode: "number" }).primaryKey(),
		pathId: bigint("path_id", { mode: "number" })
			.notNull()
			.references(() => relayPath.id, { onDelete: "cascade" }),
		// Captured at open: a path's relay is fixed while Direct holds it, and a
		// deleted relay must not erase its encoder history.
		relayId: integer("relay_id").references(() => relay.id, {
			onDelete: "set null",
		}),
		// twitch | kick | youtube | custom
		destination: text("destination").notNull(),
		// direct_destination.id or custom_direct_output.id; null for the legacy
		// managed landscape columns on path_state.
		destinationRef: text("destination_ref"),
		role: directRole("role").default("landscape").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		endedAt: timestamp("ended_at", { withTimezone: true }),
	},
	(table) => [
		check(
			"forwarder_session_valid_range",
			sql`${table.endedAt} is null or ${table.endedAt} >= ${table.startedAt}`,
		),
		check(
			"forwarder_session_destination_known",
			sql`${table.destination} in ('twitch', 'kick', 'youtube', 'custom')`,
		),
		// coalesce: a plain index treats null refs as distinct, which would let
		// managed landscape outputs open duplicate rows.
		uniqueIndex("forwarder_session_one_open")
			.on(
				table.pathId,
				table.destination,
				sql`coalesce(${table.destinationRef}, '')`,
				table.role,
			)
			.where(sql`${table.endedAt} is null`),
		index("forwarder_session_relay_started_idx").on(
			table.relayId,
			table.startedAt,
		),
	],
);
