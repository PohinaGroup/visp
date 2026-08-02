import { serverEnvSchema, webEnvSchema } from "@VISP/env/schema";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { z } from "zod";

const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");

export function setEnvValue(source: string, key: string, value: string) {
	const line = `${key}=${value}`;
	const pattern = new RegExp(`^${key}=.*$`, "m");
	if (pattern.test(source)) return source.replace(pattern, line);
	return `${source.trimEnd()}\n${line}\n`;
}

async function prepareFile(path: string, example: string) {
	const file = Bun.file(path);
	if (!(await file.exists())) {
		await Bun.write(path, Bun.file(example));
		console.log(`Created ${path.replace(`${root}/`, "")}`);
	}
	return await Bun.file(path).text();
}

async function prepareServerEnv() {
	const path = `${root}/apps/server/.env`;
	let source = await prepareFile(path, `${root}/apps/server/.env.example`);
	const generated: string[] = [];
	const ensureSecret = (key: string, value: string) => {
		const current = parse(source)[key];
		if (current && !current.startsWith("replace-with")) return;
		source = setEnvValue(source, key, value);
		generated.push(key);
	};

	ensureSecret("BETTER_AUTH_SECRET", randomBytes(32).toString("base64url"));
	ensureSecret("HOOK_SECRET", randomBytes(32).toString("base64url"));
	ensureSecret(
		"PUBLISH_URL_ENCRYPTION_KEY",
		randomBytes(32).toString("base64"),
	);
	if (generated.length) {
		await Bun.write(path, source);
		console.log(`Generated local secrets: ${generated.join(", ")}`);
	}
	return parse(source);
}

function withoutEmptyValues(values: Record<string, string | undefined>) {
	return Object.fromEntries(
		Object.entries(values).map(([key, value]) => [
			key,
			value === "" ? undefined : value,
		]),
	);
}

function validate(
	label: string,
	schema: z.ZodObject<Record<string, z.ZodType>>,
	values: Record<string, string | undefined>,
) {
	const result = schema.safeParse(withoutEmptyValues(values));
	if (result.success) return;
	const details = result.error.issues
		.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
		.join("\n");
	throw new Error(`${label} environment is invalid:\n${details}`);
}

function run(command: string[], env: Record<string, string | undefined>) {
	const result = Bun.spawnSync(command, {
		cwd: root,
		env,
		stderr: "inherit",
		stdout: "inherit",
	});
	if (!result.success) throw new Error(`Command failed: ${command.join(" ")}`);
}

async function main() {
	const serverFile = await prepareServerEnv();
	const webFile = parse(
		await prepareFile(`${root}/apps/web/.env`, `${root}/apps/web/.env.example`),
	);
	await prepareFile(
		`${root}/apps/obs-remote/.env.local`,
		`${root}/apps/obs-remote/.env.example`,
	);
	const missingProviders = [
		"GOOGLE_CLIENT_ID",
		"GOOGLE_CLIENT_SECRET",
		"KICK_CLIENT_ID",
		"KICK_CLIENT_SECRET",
		"TWITCH_CLIENT_ID",
		"TWITCH_CLIENT_SECRET",
	].filter((key) => !serverFile[key]);
	if (missingProviders.length) {
		console.warn(
			`Provider credentials not configured (related flows will fail): ${missingProviders.join(", ")}`,
		);
	}

	const localServer = {
		...serverFile,
		ADMIN_ORIGIN: "https://admin.visp.localhost",
		ADMIN_USER_IDS: serverFile.ADMIN_USER_IDS ?? "",
		DATABASE_URL: "postgresql://visp:visp@127.0.0.1:54320/visp",
		BETTER_AUTH_URL: "https://api.visp.localhost",
		CORS_ORIGIN: "https://visp.localhost",
		GOOGLE_CLIENT_ID: serverFile.GOOGLE_CLIENT_ID || "local-unconfigured",
		GOOGLE_CLIENT_SECRET:
			serverFile.GOOGLE_CLIENT_SECRET || "local-unconfigured",
		KICK_CLIENT_ID: serverFile.KICK_CLIENT_ID || "local-unconfigured",
		KICK_CLIENT_SECRET: serverFile.KICK_CLIENT_SECRET || "local-unconfigured",
		MEDIAMTX_API_URL: "http://127.0.0.1:9997",
		NATIVE_WEB_ORIGIN: "http://127.0.0.1:8081",
		OBS_REMOTE_WEB_ORIGIN: "http://localhost:8083",
		NODE_ENV: "development",
		RELAY_HOST: "relay.visp.localhost",
		RELAY_PING_URL: "https://relay.visp.localhost/ping",
		SERVER_HOST: "0.0.0.0",
		S3_ACCESS_KEY_ID: "visp",
		S3_BUCKET: "visp-snapshots",
		S3_ENDPOINT: "https://s3.visp.localhost",
		S3_REGION: "us-east-1",
		S3_SECRET_ACCESS_KEY: "visp-local-secret",
		S3_UPLOAD_ENDPOINT: "http://minio:9000",
		TWITCH_CLIENT_ID: serverFile.TWITCH_CLIENT_ID || "local-unconfigured",
		TWITCH_CLIENT_SECRET:
			serverFile.TWITCH_CLIENT_SECRET || "local-unconfigured",
	};
	const localWeb = {
		...webFile,
		VITE_SERVER_URL: "https://api.visp.localhost",
	};
	validate("Server", z.object(serverEnvSchema), localServer);
	validate("Web", z.object(webEnvSchema), localWeb);

	const env = {
		...process.env,
		...localServer,
		...localWeb,
		EXPO_PUBLIC_SERVER_URL: "https://api.visp.localhost",
	};
	run(["docker", "compose", "version"], env);
	run(["bun", "x", "portless", "proxy", "start"], env);
	run(["bun", "x", "portless", "doctor"], env);
	for (const name of ["relay.visp", "s3.visp", "minio.visp"]) {
		run(["bun", "x", "portless", "alias", name, "8082", "--force"], env);
	}
	run(["docker", "compose", "up", "--detach", "--wait", "--build"], env);
	run(["bun", "run", "--cwd", "packages/db", "db:migrate"], env);

	console.log("\nVISP local environment is ready:");
	console.log("  Web:           https://visp.localhost");
	console.log("  API:           https://api.visp.localhost");
	console.log("  Admin:         https://admin.visp.localhost");
	console.log("  Docs:          https://docs.visp.localhost");
	console.log("  OBS Remote:    http://localhost:8083");
	console.log("  Relay:         https://relay.visp.localhost");
	console.log("  S3:            https://s3.visp.localhost");
	console.log("  MinIO console: https://minio.visp.localhost\n");
	const apps = Bun.spawn(
		[
			"bun",
			"run",
			"--filter",
			"server",
			"--filter",
			"web",
			"--filter",
			"fumadocs",
			"--filter",
			"admin",
			"--filter",
			"@VISP/obs-remote",
			"--parallel",
			"dev",
		],
		{ cwd: root, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" },
	);
	for (const signal of ["SIGINT", "SIGTERM"] as const) {
		process.on(signal, () => apps.kill(signal));
	}
	process.exitCode = await apps.exited;
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	});
}
