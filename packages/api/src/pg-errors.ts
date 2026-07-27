/**
 * Drizzle wraps driver errors, so a Postgres error code sits on the cause
 * chain rather than on the thrown object. Checking only the top level silently
 * never matches, which turns a handled constraint into a 500.
 *
 * Returns the violated constraint name (possibly "") on a unique violation,
 * or null when the error is something else.
 */
export function uniqueViolation(error: unknown) {
	for (
		let current = error;
		current;
		current = (current as { cause?: unknown }).cause
	) {
		if (typeof current !== "object") break;
		const candidate = current as { code?: string; constraint?: string };
		if (candidate.code === "23505") return candidate.constraint ?? "";
	}
	return null;
}
