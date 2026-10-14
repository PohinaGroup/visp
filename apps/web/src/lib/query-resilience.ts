// Shared failure handling for the dashboard's tRPC queries: pollers back off
// while the API is failing, and an expired or revoked session sends the user
// to /login once instead of toasting UNAUTHORIZED on every poll.

const MAX_POLL_BACKOFF_MS = 60_000;

/** The slice of a react-query Query the poll helpers read. */
export type PollableQuery = {
	state: { status: string; errorUpdateCount: number };
};

// errorUpdateCount only ever grows, and fetchFailureCount resets on every
// fetch, so consecutive failures are counted from the last successful poll.
const errorsAtLastSuccess = new WeakMap<object, number>();

export function consecutiveFailures(query: PollableQuery) {
	if (query.state.status !== "error") {
		if (query.state.status === "success") {
			errorsAtLastSuccess.set(query, query.state.errorUpdateCount);
		}
		return 0;
	}
	return Math.max(
		0,
		query.state.errorUpdateCount - (errorsAtLastSuccess.get(query) ?? 0),
	);
}

/** Doubles a poll interval per consecutive failure, capped at a minute. */
export function backoffRefetchInterval(
	query: PollableQuery,
	baseMs: number | false | undefined,
): number | false {
	if (!baseMs) return false;
	const failures = consecutiveFailures(query);
	if (failures === 0) return baseMs;
	return Math.min(
		Math.max(baseMs, MAX_POLL_BACKOFF_MS),
		baseMs * 2 ** Math.min(failures, 10),
	);
}

/**
 * Options for a polled query: backs off on error, and leaves recovery to the
 * next poll rather than stacking react-query retries on top of it.
 */
export function pollWithBackoff(baseMs: number) {
	return {
		retry: false,
		refetchInterval: (query: PollableQuery) =>
			backoffRefetchInterval(query, baseMs),
	} as const;
}

export function isUnauthorizedError(error: unknown) {
	if (typeof error !== "object" || error === null) return false;
	const data = (error as { data?: unknown }).data;
	return (
		typeof data === "object" &&
		data !== null &&
		(data as { code?: unknown }).code === "UNAUTHORIZED"
	);
}

// Only the signed-in app (routes under _auth) sends an expired session to
// /login. Public pages (and /login itself) just drop the error, which also
// rules out a redirect loop.
const PROTECTED_PATHS = new Set(["/dashboard", "/setup", "/studio"]);

export function isProtectedPath(pathname: string) {
	const normalized =
		pathname.length > 1 && pathname.endsWith("/")
			? pathname.slice(0, -1)
			: pathname;
	return PROTECTED_PATHS.has(normalized);
}

/** /login URL that returns to the current page (login.tsx reads `redirect`). */
export function loginRedirectHref(location: {
	pathname: string;
	search: string;
	hash?: string;
}) {
	const params = new URLSearchParams({
		redirect: `${location.pathname}${location.search}${location.hash ?? ""}`,
	});
	if (new URLSearchParams(location.search).get("lang") === "fi") {
		params.set("lang", "fi");
	}
	return `/login?${params.toString()}`;
}
