-- Data-only and idempotent: drop Better Auth secondaryStorage entries that
-- outlived their session. Before PR #189, ban and revoke deleted `session`
-- rows with Drizzle only, so the cached `{ session, user }` entry (key = the
-- session token) kept authenticating, and Better Auth's refresh renewed its
-- TTL. Dropping a cache entry whose `session` row still exists is harmless:
-- Better Auth falls back to the row and reloads the user.
--
-- Session entries are matched by value shape (JSON.stringify({ session, user }))
-- so rate-limit counters and `verification:*` entries are never touched.

-- 1. Cached sessions whose row is gone (revoked or banned before #189).
DELETE FROM "auth_cache" AS "cache"
WHERE "cache"."value" LIKE '{"session":%'
	AND NOT EXISTS (
		SELECT 1 FROM "session" WHERE "session"."token" = "cache"."key"
	);
--> statement-breakpoint
-- 2. Cached sessions of banned users, so the next request re-reads the user.
DELETE FROM "auth_cache" AS "cache"
USING "session", "user"
WHERE "cache"."value" LIKE '{"session":%'
	AND "session"."token" = "cache"."key"
	AND "user"."id" = "session"."user_id"
	AND "user"."banned" = true;
--> statement-breakpoint
-- 3. Banned users' active-session lists (`active-sessions-<userId>`).
DELETE FROM "auth_cache" AS "cache"
USING "user"
WHERE "cache"."key" = 'active-sessions-' || "user"."id"
	AND "user"."banned" = true;
