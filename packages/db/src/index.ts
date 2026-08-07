import { env } from "@VISP/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type { PoolClient } from "pg";

import * as schema from "./schema";

const SSL_URL_PARAMS = [
	"sslmode",
	"sslrootcert",
	"sslcert",
	"sslkey",
	"uselibpqcompat",
] as const;

function databaseUrlWithoutSslParams(url: string): string {
	const parsed = new URL(url);
	for (const key of SSL_URL_PARAMS) {
		parsed.searchParams.delete(key);
	}
	return parsed.toString();
}

function isLocalDatabaseHost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1"
	);
}

function databaseSslConfig(): false | { rejectUnauthorized: true } {
	const parsed = new URL(env.DATABASE_URL);
	const sslmode = parsed.searchParams.get("sslmode");

	// Never pass a custom CA PEM via ssl.ca: Bun 1.3.x OpenSSL can segfault
	// when that is combined with Bun.S3Client in the same process. Install the
	// provider CA into the system trust store (update-ca-certificates) instead.
	if (env.DATABASE_SSL_CA) {
		console.warn(
			"DATABASE_SSL_CA is set but ignored; use the system trust store for Postgres TLS",
		);
	}

	const urlRequestsSsl =
		sslmode === "require" ||
		sslmode === "verify-ca" ||
		sslmode === "verify-full";

	// Bun's node-postgres often ignores sslmode in the URL, so pass `ssl`
	// explicitly. Remote hosts default to TLS (UpCloud requires encryption).
	if (
		urlRequestsSsl ||
		(!isLocalDatabaseHost(parsed.hostname) && sslmode !== "disable")
	) {
		return { rejectUnauthorized: true };
	}

	return false;
}

function createPool() {
	const ssl = databaseSslConfig();
	if (!ssl) {
		return new Pool({ connectionString: env.DATABASE_URL });
	}
	return new Pool({
		connectionString: databaseUrlWithoutSslParams(env.DATABASE_URL),
		ssl,
	});
}

export function createDb() {
	return drizzle(createPool(), { schema });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });
