/**
 * One-time migration for `account.encryptOAuthTokens: true`.
 *
 * Better Auth encrypts OAuth tokens only on write, so rows written before the
 * flag stay plaintext forever. A half-encrypted `account` table is worse than
 * either state, so run this once, right after deploying the flag:
 *
 *   bun apps/server/scripts/encrypt-oauth-tokens.ts --dry-run  # count only
 *   bun apps/server/scripts/encrypt-oauth-tokens.ts
 *
 * Safe to re-run: already-encrypted values carry the `$ba$` envelope prefix and
 * are skipped, which is the same test Better Auth applies on read.
 */
import { db } from "@VISP/db";
import { account } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";

const TOKEN_COLUMNS = ["accessToken", "refreshToken", "idToken"] as const;

function isEncrypted(value: string) {
	// Matches better-auth's isLikelyEncrypted: envelope prefix, or the raw hex
	// form older versions wrote.
	return (
		value.startsWith("$ba$") ||
		(value.length % 2 === 0 && /^[0-9a-f]+$/i.test(value))
	);
}

export async function encryptStoredOAuthTokens(dryRun: boolean) {
	const rows = await db
		.select({
			id: account.id,
			accessToken: account.accessToken,
			refreshToken: account.refreshToken,
			idToken: account.idToken,
		})
		.from(account);

	let changed = 0;
	for (const row of rows) {
		const update: Record<string, string> = {};
		for (const column of TOKEN_COLUMNS) {
			const value = row[column];
			if (!value || isEncrypted(value)) continue;
			update[column] = await symmetricEncrypt({
				key: env.BETTER_AUTH_SECRET,
				data: value,
			});
		}
		if (Object.keys(update).length === 0) continue;
		changed += 1;
		if (!dryRun) {
			await db.update(account).set(update).where(eq(account.id, row.id));
		}
	}
	return { scanned: rows.length, changed };
}

if (import.meta.main) {
	const dryRun = process.argv.includes("--dry-run");
	const result = await encryptStoredOAuthTokens(dryRun);
	console.log(
		`${dryRun ? "Would encrypt" : "Encrypted"} tokens on ${result.changed} of ${result.scanned} account rows`,
	);
	process.exit(0);
}
