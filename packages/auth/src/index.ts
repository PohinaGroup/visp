import { createDb } from "@VISP/db";
import * as schema from "@VISP/db/schema/auth";
import { env } from "@VISP/env/server";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import {
	admin as adminPlugin,
	bearer,
	deviceAuthorization,
	genericOAuth,
} from "better-auth/plugins";
import { fetchKickAuthUser } from "./kick-user-info";
import { adminAccess, adminRoles } from "./permissions";

export const adminUserIds = env.ADMIN_USER_IDS.split(",")
	.map((id) => id.trim())
	.filter(Boolean);

export function isAdminUser(user: { id: string; role?: string | null }) {
	return (
		user.role?.split(",").includes("admin") || adminUserIds.includes(user.id)
	);
}

const snapshots = new Bun.S3Client({
	accessKeyId: env.S3_ACCESS_KEY_ID,
	bucket: env.S3_BUCKET,
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

export async function deleteSnapshotsForPathIds(
	pathIds: number[],
	client: Pick<Bun.S3Client, "delete"> = snapshots,
) {
	await Promise.all(
		pathIds.map((pathId) => client.delete(`snapshots/${pathId}.jpg`)),
	);
}

export function createAuth() {
	const db = createDb();

	return betterAuth({
		account: {
			// Direct fetches provider stream keys with these tokens, so they stop
			// being ordinary session state. Better Auth encrypts only on write:
			// run apps/server/scripts/encrypt-oauth-tokens.ts once after deploying
			// so no plaintext row is left behind.
			encryptOAuthTokens: true,
			accountLinking: {
				allowDifferentEmails: true,
				disableImplicitLinking: true,
			},
			// Expo opens the OAuth proxy on EXPO_PUBLIC_SERVER_URL (often
			// http://127.0.0.1:3000 or a LAN IP) while Twitch returns to
			// BETTER_AUTH_URL (https://api.visp.localhost). The state cookie
			// cannot cross that host boundary; database state still validates.
			skipStateCookieCheck: env.NODE_ENV === "development",
		},
		database: drizzleAdapter(db, {
			provider: "pg",

			schema: schema,
		}),
		trustedOrigins: [
			env.CORS_ORIGIN,
			env.ADMIN_ORIGIN,
			env.NATIVE_WEB_ORIGIN,
			env.OBS_REMOTE_WEB_ORIGIN,
			"visp://",
			"obsremote://",
		],
		user: {
			deleteUser: {
				enabled: true,
				beforeDelete: async (user) => {
					const paths = await db.query.relayPath.findMany({
						columns: { id: true },
						where: (path, { eq }) => eq(path.userId, user.id),
					});
					try {
						await deleteSnapshotsForPathIds(paths.map((path) => path.id));
					} catch (cause) {
						throw new APIError("BAD_REQUEST", {
							cause,
							message: "Could not delete stored stream snapshots. Try again.",
						});
					}
				},
			},
		},
		socialProviders: {
			twitch: {
				clientId: env.TWITCH_CLIENT_ID,
				clientSecret: env.TWITCH_CLIENT_SECRET,
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
			},
		},
		plugins: [
			adminPlugin({
				ac: adminAccess,
				adminRoles: ["admin"],
				defaultRole: "user",
				roles: adminRoles,
			}),
			bearer(),
			deviceAuthorization({
				verificationUri: `${env.CORS_ORIGIN}/device`,
				validateClient: (clientId) => clientId === "visp-obs",
			}),
			expo(),
			genericOAuth({
				config: [
					{
						providerId: "kick",
						clientId: env.KICK_CLIENT_ID,
						clientSecret: env.KICK_CLIENT_SECRET,
						authorizationUrl: "https://id.kick.com/oauth/authorize",
						tokenUrl: "https://id.kick.com/oauth/token",
						pkce: true,
						scopes: ["user:read", "channel:write"],
						getUserInfo: async ({ accessToken }) => {
							if (!accessToken) return null;
							// Kick often omits email; better-auth still requires one, so we
							// synthesize a stable placeholder when the API leaves it blank.
							return fetchKickAuthUser(accessToken);
						},
					},
				],
			}),
		],
	});
}

export const auth = createAuth();
