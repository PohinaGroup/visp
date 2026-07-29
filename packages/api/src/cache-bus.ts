import { type PoolClient, pool } from "@VISP/db";

const CACHE_CHANNEL = "visp_cache";

export type CacheInvalidation =
	| { type: "full" }
	| { type: "slug"; slug: string }
	| { type: "user"; userId: string };

export const FULL_INVALIDATION = { type: "full" } as const;

export function encodeInvalidation(payload: CacheInvalidation) {
	return JSON.stringify(payload);
}

export function decodeInvalidation(value: string): CacheInvalidation | null {
	try {
		const payload = JSON.parse(value) as Partial<CacheInvalidation>;
		if (payload.type === "full") return FULL_INVALIDATION;
		if (payload.type === "slug" && typeof payload.slug === "string") {
			return { type: "slug", slug: payload.slug };
		}
		if (payload.type === "user" && typeof payload.userId === "string") {
			return { type: "user", userId: payload.userId };
		}
		return null;
	} catch {
		return null;
	}
}

export async function publishNotification(channel: string, payload: string) {
	await pool.query("select pg_notify($1, $2)", [channel, payload]);
}

export function subscribeNotifications(
	channel: string,
	handler: (payload: string) => void,
	onConnect?: () => void,
	dependencies: {
		connect: () => Promise<PoolClient>;
		retryMs?: number;
	} = { connect: () => pool.connect() },
) {
	if (!/^[a-z_][a-z0-9_]*$/.test(channel)) {
		throw new Error("Invalid Postgres notification channel");
	}
	let client: PoolClient | undefined;
	let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	const reconnect = () => {
		if (stopped || reconnectTimer) return;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = undefined;
			void connect();
		}, dependencies.retryMs ?? 1_000);
	};
	const disconnected = () => {
		const previous = client;
		client = undefined;
		previous?.removeAllListeners("notification");
		previous?.removeAllListeners("error");
		previous?.removeAllListeners("end");
		try {
			previous?.release(true);
		} catch {
			// The connection is already gone.
		}
		reconnect();
	};
	const connect = async () => {
		if (stopped || client) return;
		try {
			const next = await dependencies.connect();
			if (stopped) {
				next.release(true);
				return;
			}
			client = next;
			next.on("notification", (message) => {
				if (message.channel === channel && message.payload) {
					handler(message.payload);
				}
			});
			next.once("error", disconnected);
			next.once("end", disconnected);
			await next.query(`LISTEN ${channel}`);
			onConnect?.();
		} catch {
			disconnected();
		}
	};

	void connect();
	return () => {
		stopped = true;
		clearTimeout(reconnectTimer);
		const previous = client;
		client = undefined;
		previous?.removeAllListeners();
		// LISTEN clients are destroyed, never returned to the pool.
		previous?.release(true);
	};
}

export function publishInvalidation(payload: CacheInvalidation) {
	return publishNotification(CACHE_CHANNEL, encodeInvalidation(payload));
}

export function subscribeInvalidations(
	handler: (payload: CacheInvalidation) => void,
	dependencies?: Parameters<typeof subscribeNotifications>[3],
) {
	// NOTIFY is not durable. A full flush after every reconnect plus the
	// existing 60s auth TTL bounds missed invalidations to today's guarantee.
	return subscribeNotifications(
		CACHE_CHANNEL,
		(value) => {
			const payload = decodeInvalidation(value);
			if (payload) handler(payload);
		},
		() => handler(FULL_INVALIDATION),
		dependencies,
	);
}
