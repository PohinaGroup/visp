/**
 * Safety rails for `db:migrate` in production.
 *
 * Drizzle applies every pending migration in one transaction. Some take
 * ACCESS EXCLUSIVE locks on hot tables (`path`, `app_user`, `user`), and while
 * such an ALTER waits for a lock, every later query on that table queues
 * behind it — media auth and hooks included. A short `lock_timeout` makes the
 * migration give up instead of stalling live traffic; the whole transaction
 * rolls back, so retrying from scratch is safe.
 */

export const DEFAULT_LOCK_TIMEOUT_MS = 5_000;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 10 * 60_000;
export const DEFAULT_LOCK_ATTEMPTS = 3;

/** Postgres `lock_not_available`, raised when `lock_timeout` expires. */
const LOCK_NOT_AVAILABLE = "55P03";

/** A positive integer from the environment, or the fallback when unset. */
export function positiveIntFromEnv(
	name: string,
	fallback: number,
	env: Record<string, string | undefined> = process.env,
): number {
	const raw = env[name]?.trim();
	if (!raw) return fallback;
	if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
		throw new Error(`${name} must be a positive integer, got "${raw}"`);
	}
	return Number(raw);
}

export function migrationSettings(
	env: Record<string, string | undefined> = process.env,
) {
	return {
		lockTimeoutMs: positiveIntFromEnv(
			"MIGRATION_LOCK_TIMEOUT_MS",
			DEFAULT_LOCK_TIMEOUT_MS,
			env,
		),
		statementTimeoutMs: positiveIntFromEnv(
			"MIGRATION_STATEMENT_TIMEOUT_MS",
			DEFAULT_STATEMENT_TIMEOUT_MS,
			env,
		),
		attempts: positiveIntFromEnv(
			"MIGRATION_LOCK_ATTEMPTS",
			DEFAULT_LOCK_ATTEMPTS,
			env,
		),
	};
}

/** True when the error (or anything in its `cause` chain) is a lock timeout. */
export function isLockTimeout(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; current && depth < 5; depth++) {
		if (
			typeof current === "object" &&
			(current as { code?: unknown }).code === LOCK_NOT_AVAILABLE
		) {
			return true;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}

/**
 * Run `fn`, retrying only on lock timeouts, with a linear backoff between
 * attempts. Any other error, or the last lock timeout, is rethrown.
 */
export async function retryOnLockTimeout<T>(
	fn: () => Promise<T>,
	{
		attempts,
		backoffMs,
		onRetry,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	}: {
		attempts: number;
		backoffMs: number;
		onRetry?: (attempt: number, error: unknown) => void;
		sleep?: (ms: number) => Promise<unknown>;
	},
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fn();
		} catch (error) {
			if (attempt >= attempts || !isLockTimeout(error)) throw error;
			onRetry?.(attempt, error);
			await sleep(backoffMs * attempt);
		}
	}
}
