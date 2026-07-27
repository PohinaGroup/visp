import { z } from "zod";

const encryptionKey = z.string().refine((value) => {
	const decoded = Buffer.from(value, "base64");
	return decoded.length === 32 && decoded.toString("base64") === value;
}, "Must be a base64-encoded 32-byte key");

export const serverEnvSchema = {
	ADMIN_ORIGIN: z.url(),
	ADMIN_USER_IDS: z.string().default(""),
	AI_GATEWAY_API_KEY: z.string().min(1),
	DATABASE_URL: z.string().min(1),
	/** PEM path for managed Postgres CA verification (e.g. UpCloud). */
	DATABASE_SSL_CA: z.string().min(1).optional(),
	/**
	 * Total concurrent FFmpeg Direct distribution forwarders on the single relay
	 * node. Every forwarder is a full video+audio encode and Twitch+Kick counts
	 * as two, so set this from a measured CPU-per-forwarder number, not a guess.
	 * A calibration knob: retune it against the real box without a deploy.
	 */
	DIRECT_MAX_FORWARDERS: z.coerce.number().int().min(0).default(2),
	BETTER_AUTH_SECRET: z.string().min(32),
	BETTER_AUTH_URL: z.url(),
	CORS_ORIGIN: z.url(),
	HOOK_SECRET: z.string().min(32),
	KICK_CLIENT_ID: z.string().min(1),
	KICK_CLIENT_SECRET: z.string().min(1),
	MEDIAMTX_API_URL: z.url(),
	NATIVE_WEB_ORIGIN: z.url(),
	OBS_REMOTE_WEB_ORIGIN: z.url().optional(),
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
	PUBLISH_URL_ENCRYPTION_KEY: encryptionKey,
	RELAY_HOST: z.string().min(1),
	RELAY_PING_URL: z.url(),
	SERVER_HOST: z.string().min(1).default("127.0.0.1"),
	S3_ACCESS_KEY_ID: z.string().min(1),
	S3_BUCKET: z.string().min(1),
	S3_ENDPOINT: z.url(),
	S3_REGION: z.string().min(1),
	S3_SECRET_ACCESS_KEY: z.string().min(1),
	S3_UPLOAD_ENDPOINT: z.url().optional(),
	TWITCH_CLIENT_ID: z.string().min(1),
	TWITCH_CLIENT_SECRET: z.string().min(1),
};

export const webEnvSchema = {
	VITE_RELAY_PING_URL: z.url(),
	/** Rybbit site ID. When unset, the tracking script is not loaded. */
	VITE_RYBBIT_SITE_ID: z.string().min(1).optional(),
	VITE_SERVER_URL: z.url(),
};
