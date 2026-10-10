import { db } from "@VISP/db";
import { session } from "@VISP/db/schema/auth";
import { and, eq, ne } from "drizzle-orm";
import { auth } from "./index";

/**
 * Session revocation that reaches both places a session lives.
 *
 * Better Auth runs with `secondaryStorage` (the `auth_cache` table) and
 * `storeSessionInDatabase`. `findSession` answers from the cache first: a
 * token's cache entry holds the whole `{ session, user }` pair, user role and
 * ban flag included, and only a cache miss falls back to the `session` table.
 * Deleting `session` rows (or changing `user` rows) with Drizzle therefore
 * leaves every cached token working, with the user as it was when the session
 * was cached. Everything that ends sessions or changes what a session is
 * allowed to do goes through here instead.
 *
 * Dropping a cache entry whose `session` row still exists never signs anyone
 * out: Better Auth then reads the row and the current user from the database.
 * That makes it safe to clear the cache before the surrounding transaction
 * commits — a rollback leaves the sessions working from the table.
 */

type Database = typeof db;
/** `db` itself or a Drizzle transaction opened on it. */
type Executor = Pick<Database, "delete" | "select">;

type AuthContext = Awaited<typeof auth.$context>;
type Storage = NonNullable<AuthContext["secondaryStorage"]>;
type SessionReference = { token: string; expiresAt: number };

const activeSessionsKey = (userId: string) => `active-sessions-${userId}`;

function parse<T>(raw: unknown): T | null {
	if (typeof raw !== "string") return (raw as T) ?? null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

async function cachedReferences(storage: Storage, userId: string) {
	const now = Date.now();
	return (
		parse<SessionReference[]>(await storage.get(activeSessionsKey(userId))) ??
		[]
	).filter(({ expiresAt }) => expiresAt > now);
}

/** Remove tokens from the cache and from the user's active-session list. */
async function forgetCachedSessions(
	storage: Storage,
	userId: string,
	tokens: ReadonlySet<string>,
) {
	await Promise.all([...tokens].map((token) => storage.delete(token)));
	const now = Date.now();
	const remaining = (await cachedReferences(storage, userId))
		.filter(({ token }) => !tokens.has(token))
		.sort((a, b) => a.expiresAt - b.expiresAt);
	const furthest = remaining.at(-1)?.expiresAt;
	if (furthest) {
		await storage.set(
			activeSessionsKey(userId),
			JSON.stringify(remaining),
			Math.max(Math.floor((furthest - now) / 1000), 1),
		);
	} else {
		await storage.delete(activeSessionsKey(userId));
	}
}

/**
 * End every session the user holds: rows in the `session` table (including
 * ones that were never cached) and cached tokens (including ones whose row is
 * already gone). Pass `tx` to delete the rows inside that transaction; the
 * cache is cleared before it returns, so a failure rolls the rows back too.
 *
 * Returns how many distinct sessions were ended.
 */
export async function revokeAllUserSessions(
	userId: string,
	options: { except?: string; tx?: Executor } = {},
) {
	const { except, tx = db } = options;
	const { secondaryStorage: storage } = await auth.$context;
	const cached = storage
		? (await cachedReferences(storage, userId)).map(({ token }) => token)
		: [];
	const deleted = await tx
		.delete(session)
		.where(
			except
				? and(eq(session.userId, userId), ne(session.token, except))
				: eq(session.userId, userId),
		)
		.returning({ token: session.token });
	const tokens = new Set(
		[...cached, ...deleted.map(({ token }) => token)].filter(
			(token) => token !== except,
		),
	);
	if (storage) await forgetCachedSessions(storage, userId, tokens);
	return tokens.size;
}

/** End one session by its token, in the cache and the `session` table. */
export async function revokeSessionByToken(token: string) {
	const { internalAdapter, secondaryStorage: storage } = await auth.$context;
	// deleteSession clears the cache entry, drops the token from the user's
	// active-session list and deletes the row. It skips the row when the cache
	// entry cannot be parsed, so the row is deleted here as well.
	await internalAdapter.deleteSession(token);
	await db.delete(session).where(eq(session.token, token));
	if (storage) await storage.delete(token);
}

/**
 * Rewrite the user copy cached with each of the user's sessions so a role or
 * ban change shows up without signing them out. Use it for changes that grant
 * access; changes that take access away should revoke sessions instead, since
 * a session missed here would keep the old, wider access.
 */
export async function refreshCachedUser(userId: string) {
	const { internalAdapter, secondaryStorage: storage } = await auth.$context;
	if (!storage) return;
	const current = await internalAdapter.findUserById(userId);
	if (!current) {
		await revokeAllUserSessions(userId);
		return;
	}
	const rows = await db
		.select({ token: session.token })
		.from(session)
		.where(eq(session.userId, userId));
	const tokens = new Set([
		...(await cachedReferences(storage, userId)).map(({ token }) => token),
		...rows.map(({ token }) => token),
	]);
	const now = Date.now();
	await Promise.all(
		[...tokens].map(async (token) => {
			const cached = parse<{
				session?: { userId?: string; expiresAt?: string | number };
			}>(await storage.get(token));
			if (!cached?.session || cached.session.userId !== userId) return;
			const ttl = Math.floor(
				(new Date(cached.session.expiresAt ?? 0).getTime() - now) / 1000,
			);
			if (ttl <= 0) {
				await storage.delete(token);
				return;
			}
			await storage.set(
				token,
				JSON.stringify({ session: cached.session, user: current }),
				ttl,
			);
		}),
	);
}

/**
 * Better Auth's admin plugin treats a ban whose expiry has passed as lifted
 * (it clears it on the next sign-in), so access checks do the same.
 */
export function isBanActive(user: {
	banned?: boolean | null;
	banExpires?: Date | string | number | null;
}) {
	if (!user.banned) return false;
	if (user.banExpires == null) return true;
	return new Date(user.banExpires).getTime() > Date.now();
}
