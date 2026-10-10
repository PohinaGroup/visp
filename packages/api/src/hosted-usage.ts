import { db } from "@VISP/db";
import {
	HOSTED_USAGE_FEATURES,
	HOSTED_USAGE_UNITS,
	type HostedUsageFeature,
	type HostedUsageUnit,
} from "@VISP/db/schema/index";
import { sql } from "drizzle-orm";

export type { HostedUsageFeature, HostedUsageUnit };

export type HostedUsageEvent = {
	userId: string;
	feature: HostedUsageFeature;
	/** Positive amount in `unit`; fractions are summed, then rounded up on write. */
	units: number;
	unit: HostedUsageUnit;
	/** Who billed it (e.g. "elevenlabs"), so prices can differ per provider. */
	provider?: string | null;
};

/** One aggregated row as handed to the writer. `units` is a positive integer. */
export type HostedUsageRow = {
	userId: string;
	feature: HostedUsageFeature;
	units: number;
	unit: HostedUsageUnit;
	provider: string | null;
};

export type HostedUsageWriter = (rows: HostedUsageRow[]) => Promise<void>;

type Logger = Pick<Console, "warn" | "error">;

/**
 * Metering sits on the speech/subtitle hot paths, which a database hiccup must
 * never slow down or break. So usage is summed in memory and written about once
 * a minute in one multi-row insert; the caller only ever touches a Map.
 */
export const HOSTED_USAGE_FLUSH_INTERVAL_MS = 60_000;
/**
 * A key is one (user, feature, unit, provider). Far above a minute of real
 * traffic, so hitting it means the database has been unreachable for a while;
 * at that point dropping the oldest usage beats growing without bound.
 */
export const HOSTED_USAGE_MAX_KEYS = 10_000;

const FEATURES = new Set<string>(HOSTED_USAGE_FEATURES);
const UNITS = new Set<string>(HOSTED_USAGE_UNITS);

/**
 * The buffer with its writer injected, so aggregation, retry and the bound can
 * be tested without a database. Production code uses the module-level
 * `recordHostedUsage` / `flushHostedUsage` below.
 */
export function createHostedUsageBuffer({
	write,
	maxKeys = HOSTED_USAGE_MAX_KEYS,
	log = console,
}: {
	write: HostedUsageWriter;
	maxKeys?: number;
	log?: Logger;
}) {
	let pending = new Map<string, HostedUsageRow>();
	let dropped = 0;
	// Flushes run one at a time so a retry merge never races a newer flush.
	let chain: Promise<void> = Promise.resolve();

	/** Adds into `target`, keeping Map insertion order as oldest-first. */
	function add(target: Map<string, HostedUsageRow>, row: HostedUsageRow) {
		const key = JSON.stringify([
			row.userId,
			row.feature,
			row.unit,
			row.provider,
		]);
		const existing = target.get(key);
		if (existing) {
			existing.units += row.units;
			return;
		}
		target.set(key, { ...row });
	}

	function trim() {
		while (pending.size > maxKeys) {
			const oldest = pending.keys().next().value;
			if (oldest === undefined) break;
			pending.delete(oldest);
			if (dropped === 0) {
				log.warn(
					`Hosted usage buffer is full (${maxKeys} keys); dropping the oldest usage until a flush succeeds`,
				);
			}
			dropped += 1;
		}
	}

	function record(event: HostedUsageEvent): void {
		try {
			const provider = event.provider ?? null;
			if (
				typeof event.userId !== "string" ||
				event.userId.length === 0 ||
				!FEATURES.has(event.feature) ||
				!UNITS.has(event.unit) ||
				!Number.isFinite(event.units) ||
				event.units <= 0 ||
				(provider !== null && typeof provider !== "string")
			) {
				log.warn("Ignoring invalid hosted usage event", {
					feature: event.feature,
					unit: event.unit,
					units: event.units,
				});
				return;
			}
			add(pending, {
				userId: event.userId,
				feature: event.feature,
				units: event.units,
				unit: event.unit,
				provider,
			});
			trim();
		} catch (error) {
			// Metering is bookkeeping; the feature itself already succeeded.
			log.error("Failed to buffer hosted usage", error);
		}
	}

	async function flushOnce() {
		if (pending.size === 0) return;
		const batch = pending;
		pending = new Map();
		const rows = [...batch.values()].map((row) => ({
			...row,
			// Providers bill partial units as whole ones; the column is bigint.
			units: Math.ceil(row.units),
		}));
		try {
			await write(rows);
			if (dropped > 0) {
				log.warn(
					`Hosted usage flush recovered; ${dropped} usage keys were dropped`,
				);
				dropped = 0;
			}
		} catch (error) {
			log.error(
				`Hosted usage flush failed; keeping ${batch.size} rows for the next flush`,
				error,
			);
			// The failed batch is older than anything recorded meanwhile, so it
			// goes back in front and is first to be dropped if the bound is hit.
			const merged = new Map<string, HostedUsageRow>();
			for (const row of batch.values()) add(merged, row);
			for (const row of pending.values()) add(merged, row);
			pending = merged;
			trim();
		}
	}

	/** Resolves once everything recorded before the call was attempted. Never rejects. */
	function flush(): Promise<void> {
		chain = chain.then(flushOnce, flushOnce);
		return chain;
	}

	return {
		record,
		flush,
		/** Buffered keys, for tests and diagnostics. */
		size: () => pending.size,
	};
}

/**
 * One multi-row insert. Rows whose user was deleted since they were recorded
 * are skipped in SQL rather than failing the foreign key, because a failure
 * would be retried forever and wedge every other user's usage behind it.
 */
export const writeHostedUsageRows: HostedUsageWriter = async (rows) => {
	if (rows.length === 0) return;
	const values = sql.join(
		rows.map(
			(row) =>
				sql`(${row.userId}::text, ${row.feature}::text, ${row.units}::bigint, ${row.unit}::text, ${row.provider}::text)`,
		),
		sql`, `,
	);
	await db.execute(sql`
		insert into hosted_usage (user_id, feature, units, unit, provider)
		select v.user_id, v.feature, v.units, v.unit, v.provider
		from (values ${values}) as v(user_id, feature, units, unit, provider)
		where exists (select 1 from "user" u where u.id = v.user_id)
	`);
};

const buffer = createHostedUsageBuffer({ write: writeHostedUsageRows });
let timer: ReturnType<typeof setInterval> | undefined;

function ensureTimer() {
	if (timer) return;
	timer = setInterval(
		() => void buffer.flush(),
		HOSTED_USAGE_FLUSH_INTERVAL_MS,
	);
	// The meter must not be the reason a process stays up.
	timer.unref?.();
	// An idle process (tests, scripts) exits via beforeExit; flush there too.
	process.once("beforeExit", () => void buffer.flush());
}

/**
 * Records billable usage of a hosted feature. Synchronous and never throws:
 * it only adds to an in-memory sum that is written within a minute. Call it
 * only on the hosted path, after the provider accepted the work, never for
 * on-device fallbacks.
 */
export function recordHostedUsage(event: HostedUsageEvent): void {
	buffer.record(event);
	ensureTimer();
}

/** Writes buffered usage now. For tests and shutdown; never rejects. */
export function flushHostedUsage(): Promise<void> {
	return buffer.flush();
}

/**
 * Flushes on SIGTERM/SIGINT before exiting, bounded so a dead database cannot
 * hold up a deploy. Call once from a long-running entrypoint; a library module
 * installing signal handlers on import would change how every test exits.
 */
export function flushHostedUsageOnShutdown(timeoutMs = 5_000) {
	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.once(signal, () => {
			void Promise.race([
				buffer.flush(),
				new Promise((resolve) => setTimeout(resolve, timeoutMs)),
			]).finally(() => process.exit(0));
		});
	}
}
