import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const encryptionKey = z.string().refine((value) => {
	const decoded = Buffer.from(value, "base64");
	return decoded.length === 32 && decoded.toString("base64") === value;
}, "Must be a base64-encoded 32-byte key");

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		/** PEM path for managed Postgres CA verification (e.g. UpCloud). */
		DATABASE_SSL_CA: z.string().min(1).optional(),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		HOOK_SECRET: z.string().min(32),
		KICK_CLIENT_ID: z.string().min(1),
		KICK_CLIENT_SECRET: z.string().min(1),
		MEDIAMTX_API_URL: z.url(),
		NATIVE_WEB_ORIGIN: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		PUBLISH_URL_ENCRYPTION_KEY: encryptionKey,
		RELAY_HOST: z.string().min(1),
		RELAY_PING_URL: z.url(),
		S3_ACCESS_KEY_ID: z.string().min(1),
		S3_BUCKET: z.string().min(1),
		S3_ENDPOINT: z.url(),
		S3_REGION: z.string().min(1),
		S3_SECRET_ACCESS_KEY: z.string().min(1),
		TWITCH_CLIENT_ID: z.string().min(1),
		TWITCH_CLIENT_SECRET: z.string().min(1),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
