import { env } from "@VISP/env/server";
import { readFileSync } from "node:fs";
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

function createPool() {
	const sslCaPath = env.DATABASE_SSL_CA;
	return new Pool(
		sslCaPath
			? {
					connectionString: databaseUrlWithoutSslParams(env.DATABASE_URL),
					ssl: {
						ca: readFileSync(sslCaPath, "utf8"),
						rejectUnauthorized: true,
					},
				}
			: { connectionString: env.DATABASE_URL },
	);
}

export function createDb() {
	return drizzle(createPool(), { schema });
}

export const pool = createPool();
export const db = drizzle(pool, { schema });
