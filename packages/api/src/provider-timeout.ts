/** Long enough for a slow provider, short enough not to pin a hook or a pool slot. */
export const PROVIDER_TIMEOUT_MS = 10_000;

/**
 * Bounds an outbound provider request (headers and body). A caller's own
 * signal still applies; whichever fires first aborts the request.
 */
export function withProviderTimeout(
	init: RequestInit | undefined,
	timeoutMs = PROVIDER_TIMEOUT_MS,
): RequestInit {
	const timeout = AbortSignal.timeout(timeoutMs);
	return {
		...init,
		signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
	};
}
