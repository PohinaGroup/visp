import type { createDb } from "@VISP/db";
import { authCache } from "@VISP/db/schema/auth";
import { and, eq, gt, lte, sql } from "drizzle-orm";

type Database = ReturnType<typeof createDb>;

/** Better Auth's shared cache contract, backed by the existing Postgres. */
export function createDatabaseSecondaryStorage(db: Database) {
	return {
		async get(key: string) {
			const [entry] = await db
				.select({ value: authCache.value })
				.from(authCache)
				.where(and(eq(authCache.key, key), gt(authCache.expiresAt, new Date())))
				.limit(1);
			return entry?.value ?? null;
		},
		async set(key: string, value: string, ttlSeconds = 60 * 60) {
			await db.delete(authCache).where(lte(authCache.expiresAt, new Date()));
			await db
				.insert(authCache)
				.values({
					key,
					value,
					expiresAt: new Date(Date.now() + ttlSeconds * 1000),
				})
				.onConflictDoUpdate({
					target: authCache.key,
					set: {
						value,
						expiresAt: new Date(Date.now() + ttlSeconds * 1000),
					},
				});
		},
		async delete(key: string) {
			await db.delete(authCache).where(eq(authCache.key, key));
		},
		async getAndDelete(key: string) {
			const [entry] = await db
				.delete(authCache)
				.where(and(eq(authCache.key, key), gt(authCache.expiresAt, new Date())))
				.returning({ value: authCache.value });
			return entry?.value ?? null;
		},
		async increment(key: string, ttlSeconds: number) {
			await db.delete(authCache).where(lte(authCache.expiresAt, new Date()));
			const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
			const result = await db.execute<{ value: string }>(sql`
				insert into auth_cache (key, value, expires_at)
				values (${key}, '1', ${expiresAt})
				on conflict (key) do update set
					value = case when auth_cache.expires_at <= now() then '1'
						else (auth_cache.value::integer + 1)::text end,
					expires_at = case when auth_cache.expires_at <= now() then excluded.expires_at
						else auth_cache.expires_at end
				returning value
			`);
			return Number(result.rows[0]?.value ?? 1);
		},
	};
}
