import { createDb } from "@VISP/db";
import * as schema from "@VISP/db/schema/auth";
import { env } from "@VISP/env/server";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins";

type KickUser = {
	email: string;
	name: string;
	profile_picture?: string | null;
	user_id: number;
};

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
			accountLinking: {
				allowDifferentEmails: true,
				disableImplicitLinking: true,
			},
		},
		database: drizzleAdapter(db, {
			provider: "pg",

			schema: schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN, env.NATIVE_WEB_ORIGIN, "visp://"],
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
							const response = await fetch(
								"https://api.kick.com/public/v1/users",
								{
									headers: { Authorization: `Bearer ${accessToken}` },
								},
							);
							if (!response.ok) return null;
							const payload = (await response.json()) as { data?: KickUser[] };
							const profile = payload.data?.[0];
							if (!profile?.email || !profile.name || !profile.user_id)
								return null;
							return {
								id: String(profile.user_id),
								email: profile.email,
								emailVerified: false,
								name: profile.name,
								image: profile.profile_picture ?? undefined,
							};
						},
					},
				],
			}),
		],
	});
}

export const auth = createAuth();
