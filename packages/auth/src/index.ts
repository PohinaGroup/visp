import { createDb } from "@VISP/db";
import * as schema from "@VISP/db/schema/auth";
import { appUser } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
import { createObjectStore, type ObjectStore } from "@VISP/object-store";
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
import { eq, sql } from "drizzle-orm";
import { routerOwnedAdminEndpoints } from "./admin-endpoints";
import { agentAuthPlugin } from "./agent";
import { isBanActive } from "./ban";
import { sendAuthEmail } from "./email";
import { fetchKickAuthUser } from "./kick-user-info";
import { isObsPairingToken, obsPairingScope } from "./obs-pairing";
import { adminAccess, adminRoles } from "./permissions";
import { reservedEmailDomains } from "./reserved-email";
import { createDatabaseSecondaryStorage } from "./secondary-storage";

/**
 * Audience for Apple identity tokens. A public identifier rather than a secret,
 * so it stays here next to the other provider wiring instead of in the env
 * schema; keep it equal to `ios.bundleIdentifier` in apps/native/app.json.
 * The staging deployment overrides it with the (TEST) bundle identifier via
 * APPLE_BUNDLE_IDENTIFIER in /etc/visp-staging/app.env.
 */
const APPLE_BUNDLE_IDENTIFIER =
	process.env.APPLE_BUNDLE_IDENTIFIER ?? "com.pohinagroup.visp";

export const adminUserIds = env.ADMIN_USER_IDS.split(",")
	.map((id) => id.trim())
	.filter(Boolean);

export function isAdminUser(user: { id: string; role?: string | null }) {
	return (
		user.role?.split(",").includes("admin") || adminUserIds.includes(user.id)
	);
}

const snapshots = createObjectStore({
	accessKeyId: env.S3_ACCESS_KEY_ID,
	bucket: env.S3_BUCKET,
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION,
	secretAccessKey: env.S3_SECRET_ACCESS_KEY,
});

export async function deleteSnapshotsForPathIds(
	pathIds: number[],
	client: Pick<ObjectStore, "delete"> = snapshots,
) {
	await Promise.all(
		pathIds.map((pathId) => client.delete(`snapshots/${pathId}.jpg`)),
	);
}

/** Both extensions: only one is ever recorded, but either may exist. */
export async function deleteBrbImagesForUser(
	userId: string,
	client: Pick<ObjectStore, "delete"> = snapshots,
) {
	await Promise.all(
		["png", "jpg"].map((extension) =>
			client.delete(`brb/${userId}.${extension}`),
		),
	);
}

export async function deleteBrbHighlights(
	keys: string[],
	client: Pick<ObjectStore, "delete"> = snapshots,
) {
	await Promise.all(keys.map((key) => client.delete(key)));
}

export async function deleteBrbHighlightUploadsForUser(
	userId: string,
	client: Pick<ObjectStore, "delete" | "list"> = snapshots,
) {
	const keys = await client.list(`brb/${userId}/highlights/uploads/`);
	await Promise.all(keys.map((key) => client.delete(key)));
}

/** Every OBS backup the plugin uploaded, finished or not. */
export async function deleteObsBackupsForUser(
	userId: string,
	client: Pick<ObjectStore, "delete" | "list"> = snapshots,
) {
	const keys = await client.list(`obs-backups/${userId}/`);
	for (let index = 0; index < keys.length; index += 16) {
		await Promise.all(
			keys.slice(index, index + 16).map((key) => client.delete(key)),
		);
	}
}

export function createAuth() {
	const db = createDb();

	return betterAuth({
		secondaryStorage: createDatabaseSecondaryStorage(db),
		session: { storeSessionInDatabase: true },
		databaseHooks: {
			session: {
				create: {
					// The admin plugin refuses banned users before a session is created.
					// A ban that commits between that check and the insert revokes
					// sessions before this one exists, so check again once it does: a
					// ban committed before this read is seen here, and one committed
					// after it finds this session when the ban revokes again post-commit
					// (packages/api/src/routers/admin.ts). OAuth sign-in writes the cache
					// entry after this hook; that entry's user is read later still, so
					// it says banned and getUserSession refuses it.
					async after(created) {
						const [owner] = await db
							.select({
								banned: schema.user.banned,
								banExpires: schema.user.banExpires,
							})
							.from(schema.user)
							.where(eq(schema.user.id, created.userId))
							.limit(1);
						if (!owner || !isBanActive(owner)) return;
						await db
							.delete(schema.authCache)
							.where(eq(schema.authCache.key, created.token));
						await db
							.delete(schema.session)
							.where(eq(schema.session.token, created.token));
					},
				},
			},
		},
		verification: { storeInDatabase: true },
		account: {
			// Direct fetches provider stream keys with these tokens, so they stop
			// being ordinary session state. Better Auth encrypts only on write:
			// run apps/server/scripts/encrypt-oauth-tokens.ts once after deploying
			// so no plaintext row is left behind.
			encryptOAuthTokens: true,
			// Sign-in asks only for identity scopes, but Better Auth would still
			// overwrite the stored tokens while keeping account.scope. The UI then
			// says "Authorized" and Direct fails with a 401 from Twitch. Tokens
			// change only through linkSocial, which also merges the scope.
			updateAccountOnSignIn: false,
			// Implicit linking stays on so a streamer signing in with Google lands on
			// the account they already made with Twitch. Better Auth only links when
			// both the provider's email and the stored one are verified, and Kick
			// always reports emailVerified: false, so it can never link this way.
			accountLinking: { allowDifferentEmails: true },
			// Expo opens the OAuth proxy on EXPO_PUBLIC_SERVER_URL (often
			// http://127.0.0.1:3000 or a LAN IP) while Twitch returns to
			// BETTER_AUTH_URL (https://api.visp.localhost). The state cookie
			// cannot cross that host boundary; database state still validates.
			skipStateCookieCheck: env.NODE_ENV === "development",
		},
		emailAndPassword: {
			enabled: true,
			minPasswordLength: 10,
			requireEmailVerification: true,
			sendResetPassword: ({ user, url }) =>
				sendAuthEmail(env.RESEND_API_KEY, {
					subject: "Reset your VISP password",
					text: `Reset your VISP password by opening this link:\n\n${url}\n\nThis link expires in one hour. If you did not request a reset, you can ignore this email.`,
					to: user.email,
				}),
		},
		emailVerification: {
			sendOnSignIn: true,
			sendOnSignUp: true,
			sendVerificationEmail: ({ user, url }) =>
				sendAuthEmail(env.RESEND_API_KEY, {
					subject: "Verify your VISP email address",
					text: `Verify your VISP email address by opening this link:\n\n${url}\n\nIf you did not create a VISP account, you can ignore this email.`,
					to: user.email,
				}),
		},
		database: drizzleAdapter(db, {
			provider: "pg",

			schema: schema,
		}),
		trustedOrigins: [
			env.CORS_ORIGIN,
			env.TYPOGRAPHY_ORIGIN ?? "https://typography.visp-stream.com",
			"https://typography.visp.localhost",
			env.ADMIN_ORIGIN,
			env.MULTICHAT_ORIGIN,
			env.NATIVE_WEB_ORIGIN,
			env.OBS_REMOTE_WEB_ORIGIN,
			"visp://",
			"obsremote://",
		],
		user: {
			deleteUser: {
				enabled: true,
				beforeDelete: async (user) => {
					const { paths, highlights } = await db.transaction(async (tx) => {
						await tx.execute(
							sql`select pg_advisory_xact_lock(hashtext(${user.id}))`,
						);
						await tx
							.update(appUser)
							.set({ brbHighlightsDeleting: true })
							.where(eq(appUser.id, user.id));
						return {
							paths: await tx.query.relayPath.findMany({
								columns: { id: true },
								where: (path, { eq }) => eq(path.userId, user.id),
							}),
							highlights: await tx.query.brbHighlight.findMany({
								columns: { storageKey: true },
								where: (clip, { eq }) => eq(clip.userId, user.id),
							}),
						};
					});
					try {
						await deleteSnapshotsForPathIds(paths.map((path) => path.id));
						await deleteBrbImagesForUser(user.id);
						await deleteBrbHighlights(
							highlights.map(({ storageKey }) => storageKey),
						);
						await deleteBrbHighlightUploadsForUser(user.id);
						await deleteObsBackupsForUser(user.id);
					} catch (cause) {
						await db.transaction(async (tx) => {
							await tx.execute(
								sql`select pg_advisory_xact_lock(hashtext(${user.id}))`,
							);
							await tx
								.update(appUser)
								.set({ brbHighlightsDeleting: false })
								.where(eq(appUser.id, user.id));
						});
						throw new APIError("BAD_REQUEST", {
							cause,
							message: "Could not delete stored stream media. Try again.",
						});
					}
				},
			},
		},
		socialProviders: {
			// App Store guideline 4.8: the iOS app offers only third-party logins, so
			// it must offer this one too. It is native-only — the phone sends an
			// identity token straight from ASAuthorization, so verification needs the
			// bundle identifier as the audience and never the Services ID or the
			// .p8-signed client secret the browser redirect flow would require.
			apple: {
				appBundleIdentifier: APPLE_BUNDLE_IDENTIFIER,
				clientId: APPLE_BUNDLE_IDENTIFIER,
			},
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
				accessType: "offline",
				prompt: "select_account consent",
				redirectURI:
					env.NODE_ENV === "development"
						? "http://localhost:3000/api/auth/google-local-callback"
						: undefined,
			},
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
			// First, so no other plugin's hook sees an OBS pairing session.
			obsPairingScope(),
			agentAuthPlugin,
			// Placeholder provider addresses can only come from provider sign-in.
			reservedEmailDomains(),
			// Bans, role changes and session revocation go through the tRPC admin
			// router, which also ends the user's non-session credentials.
			routerOwnedAdminEndpoints(),
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
						redirectURI: new URL(
							"/api/auth/oauth2/callback/kick",
							env.BETTER_AUTH_URL,
						).href,
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

export const auth: ReturnType<typeof createAuth> = createAuth();

/**
 * The signed-in user's session for API routes. Sessions from OBS pairing
 * (Better Auth's device flow) are refused here: they exist only so the plugin
 * can call `POST /api/obs/connect`, the one caller of `auth.api.getSession`.
 *
 * So is a session whose cached user is banned. That copy is not current (see
 * packages/auth/src/sessions.ts), so this is a free backstop, not the ban
 * check: bans revoke sessions. It catches a session created while a ban was
 * committing, whose cache entry was written after the ban.
 */
export async function getUserSession(headers: Headers) {
	const session = await auth.api.getSession({ headers });
	return session &&
		!isObsPairingToken(session.session.token) &&
		!isBanActive(session.user)
		? session
		: null;
}
