import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

// Runs 0033 against a migrated database inside a transaction that is rolled
// back, so it never leaves data behind (nor deletes any).
const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const statements = readFileSync(
	join(
		dirname(fileURLToPath(import.meta.url)),
		"migrations/0033_auth_cache_cleanup.sql",
	),
	"utf8",
)
	.split("--> statement-breakpoint")
	.map((statement) => statement.trim())
	.filter(Boolean);

integration("0033 auth_cache cleanup", () => {
	test("drops orphaned and banned-user sessions only", async () => {
		const client = new Client({
			connectionString: process.env.TEST_DATABASE_URL,
		});
		await client.connect();
		const id = crypto.randomUUID().slice(0, 8);
		const okUser = `cleanup-ok-${id}`;
		const bannedUser = `cleanup-banned-${id}`;
		const key = (name: string) => `${name}-${id}`;
		const cachedSession = (token: string, userId: string) =>
			JSON.stringify({
				session: { id: token, token, userId, expiresAt: "2099-01-01" },
				user: { id: userId, banned: userId === bannedUser },
			});
		try {
			await client.query("begin");
			await client.query(
				`insert into "user" (id, name, email, banned) values
					($1, 'Ok', $1 || '@example.test', false),
					($2, 'Banned', $2 || '@example.test', true)`,
				[okUser, bannedUser],
			);
			await client.query(
				`insert into session (id, token, user_id, expires_at, updated_at) values
					($1, $1, $3, now() + interval '1 day', now()),
					($2, $2, $4, now() + interval '1 day', now())`,
				[key("live"), key("banned-live"), okUser, bannedUser],
			);
			const entries: [string, string][] = [
				[key("live"), cachedSession(key("live"), okUser)],
				[key("orphan"), cachedSession(key("orphan"), okUser)],
				[key("banned-live"), cachedSession(key("banned-live"), bannedUser)],
				[
					`active-sessions-${okUser}`,
					JSON.stringify([{ token: key("live"), expiresAt: 4e12 }]),
				],
				[
					`active-sessions-${bannedUser}`,
					JSON.stringify([{ token: key("banned-live"), expiresAt: 4e12 }]),
				],
				[key("rate-limit"), "5"],
				[`verification:${key("code")}`, '{"value":"x"}'],
			];
			for (const [entryKey, value] of entries) {
				await client.query(
					`insert into auth_cache (key, value, expires_at)
					values ($1, $2, now() + interval '1 day')`,
					[entryKey, value],
				);
			}

			// Twice: the migration must be idempotent.
			for (const statement of [...statements, ...statements]) {
				await client.query(statement);
			}

			const { rows } = await client.query<{ key: string }>(
				"select key from auth_cache where key = any($1)",
				[entries.map(([entryKey]) => entryKey)],
			);
			expect(rows.map((row) => row.key).sort()).toEqual(
				[
					key("live"),
					`active-sessions-${okUser}`,
					key("rate-limit"),
					`verification:${key("code")}`,
				].sort(),
			);
		} finally {
			await client.query("rollback");
			await client.end();
		}
	});
});
