// Kept apart from index.ts so it can be tested without loading the server env.

export const DEFAULT_POOL_MAX = 20;
/** How long a caller waits for a free connection before the query fails. */
export const POOL_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Pool size from DATABASE_POOL_MAX. Background jobs hold connections for long
 * stretches (advisory locks, the path reconciler, chat connectors), so pg's
 * default of 10 can starve hook and auth queries at boot. Read directly
 * rather than through @VISP/env so a typo falls back instead of failing boot.
 */
export function poolMax(raw = process.env.DATABASE_POOL_MAX): number {
	const value = Number(raw?.trim());
	if (raw?.trim() && Number.isInteger(value) && value > 0) return value;
	if (raw?.trim()) {
		console.warn(
			`DATABASE_POOL_MAX="${raw}" is not a positive integer; using ${DEFAULT_POOL_MAX}`,
		);
	}
	return DEFAULT_POOL_MAX;
}
