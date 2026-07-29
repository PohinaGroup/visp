import { readFileSync } from "node:fs";

import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({
	path: "../../apps/server/.env",
});

const databaseUrl = process.env.DATABASE_URL || "";
const sslCaPath = process.env.DATABASE_SSL_CA;

function isLocalDatabaseHost(hostname: string): boolean {
	return (
		hostname === "localhost" ||
		hostname === "127.0.0.1" ||
		hostname === "::1"
	);
}

function postgresCredentials(url: string) {
	const parsed = new URL(url);
	const database = parsed.pathname.replace(/^\//, "");
	if (!database) {
		throw new Error("DATABASE_URL must include a database name");
	}

	const sslmode = parsed.searchParams.get("sslmode");
	const urlRequestsSsl =
		sslmode === "require" ||
		sslmode === "verify-ca" ||
		sslmode === "verify-full";
	const needsSsl =
		Boolean(sslCaPath) ||
		urlRequestsSsl ||
		(!isLocalDatabaseHost(parsed.hostname) && sslmode !== "disable");

	return {
		host: parsed.hostname,
		port: parsed.port ? Number(parsed.port) : 5432,
		user: decodeURIComponent(parsed.username),
		password: decodeURIComponent(parsed.password),
		database,
		...(needsSsl
			? {
					ssl: {
						...(sslCaPath
							? { ca: readFileSync(sslCaPath, "utf8") }
							: {}),
						rejectUnauthorized: true as const,
					},
				}
			: {}),
	};
}

export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "postgresql",
	dbCredentials: databaseUrl
		? postgresCredentials(databaseUrl)
		: { url: databaseUrl },
});
