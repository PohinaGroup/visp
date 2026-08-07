import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// migrate.ts lives in packages/db/src/
const srcDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(srcDir, "..");

// Prefer the process env (deploy sources /etc/visp/app.env). Fall back to the
// local server .env for developer machines. Turbo must pass DATABASE_URL
// through (see turbo.json db:migrate.passThroughEnv).
if (!process.env.DATABASE_URL) {
	dotenv.config({
		path: join(packageDir, "../../apps/server/.env"),
	});
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	console.error("Migration failed: DATABASE_URL is not set");
	process.exit(1);
}

function isLocalDatabaseHost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1"
	);
}

function createMigrationPool(url: string) {
	const parsed = new URL(url);
	const sslmode = parsed.searchParams.get("sslmode");
	const urlRequestsSsl =
		sslmode === "require" ||
		sslmode === "verify-ca" ||
		sslmode === "verify-full";
	// Match the runtime pool: never pass a custom CA PEM (Bun+S3 segfault).
	// Rely on the system trust store for managed Postgres.
	const needsSsl =
		Boolean(process.env.DATABASE_SSL_CA) ||
		urlRequestsSsl ||
		(!isLocalDatabaseHost(parsed.hostname) && sslmode !== "disable");

	if (!needsSsl) {
		return new Pool({ connectionString: url });
	}

	for (const key of [
		"sslmode",
		"sslrootcert",
		"sslcert",
		"sslkey",
		"uselibpqcompat",
	] as const) {
		parsed.searchParams.delete(key);
	}

	return new Pool({
		connectionString: parsed.toString(),
		ssl: { rejectUnauthorized: true },
	});
}

const pool = createMigrationPool(connectionString);
const db = drizzle(pool);
const migrationsFolder = join(srcDir, "migrations");

try {
	await migrate(db, { migrationsFolder });
	console.log("Migrations applied successfully");
} catch (error) {
	console.error("Migration failed:");
	if (error instanceof Error) {
		console.error(error.message);
		if (error.cause !== undefined) {
			console.error(error.cause);
		}
	} else {
		console.error(error);
	}
	process.exit(1);
} finally {
	await pool.end();
}
