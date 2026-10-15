import "./test-env";
import { kickPlaceholderEmail } from "@VISP/auth/kick-user-info";
import { db } from "@VISP/db";
import { account, user } from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { handleAuthRequest } from "./auth-handler";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const origin = process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000";
const browserOrigin = process.env.CORS_ORIGIN ?? "http://127.0.0.1:3001";

integration("Kick placeholder email addresses", () => {
	// Unique per run so a reused database never finds a leftover user.
	const kickId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
	const placeholder = kickPlaceholderEmail(kickId);
	const ordinary = `placeholder-control-${crypto.randomUUID()}@example.com`;
	const realFetch = globalThis.fetch;

	beforeAll(() => {
		// Stand in for Resend and Kick; everything else is a real request.
		globalThis.fetch = (async (
			input: Request | string | URL,
			init?: RequestInit,
		) => {
			const url = new URL(
				typeof input === "string" || input instanceof URL ? input : input.url,
			);
			if (url.hostname === "api.resend.com") {
				return Response.json({ id: "email" });
			}
			if (url.href === "https://id.kick.com/oauth/token") {
				return Response.json({
					access_token: "kick-access-token",
					refresh_token: "kick-refresh-token",
					token_type: "Bearer",
					expires_in: 3600,
					scope: "user:read channel:write",
				});
			}
			if (url.href === "https://api.kick.com/public/v1/users") {
				return Response.json({
					data: [{ user_id: kickId, name: "Victim", email: "" }],
				});
			}
			return realFetch(input, init);
		}) as typeof fetch;
	});

	afterAll(async () => {
		globalThis.fetch = realFetch;
		const rows = await db
			.select({ id: user.id })
			.from(user)
			.where(inArray(user.email, [placeholder, ordinary]));
		const ids = rows.map((row) => row.id);
		if (ids.length) {
			await db.delete(account).where(inArray(account.userId, ids));
			await db.delete(user).where(inArray(user.id, ids));
		}
	});

	async function signUp(email: string) {
		return handleAuthRequest(
			new Request(`${origin}/api/auth/sign-up/email`, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: browserOrigin,
				},
				body: JSON.stringify({
					email,
					name: "Someone",
					password: "correct-horse-battery",
				}),
			}),
		);
	}

	test.serial("email sign-up cannot claim a Kick placeholder", async () => {
		for (const email of [
			placeholder,
			placeholder.toUpperCase(),
			placeholder.replace("@", "+x@"),
			`kick-${kickId}@sub.users.noreply.visp-stream.com`,
		]) {
			const response = await signUp(email);
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				code: "INVALID_EMAIL",
				message: "Invalid email",
			});
		}
		expect(
			await db.query.user.findFirst({ where: eq(user.email, placeholder) }),
		).toBeUndefined();
	});

	test.serial("ordinary email sign-up still works", async () => {
		const response = await signUp(ordinary);
		expect(response.status).toBe(200);
		expect(
			await db.query.user.findFirst({ where: eq(user.email, ordinary) }),
		).toBeDefined();
	});

	test.serial(
		"Kick sign-in still creates the placeholder account",
		async () => {
			const start = await handleAuthRequest(
				new Request(`${origin}/api/auth/sign-in/oauth2`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: browserOrigin,
					},
					body: JSON.stringify({
						providerId: "kick",
						callbackURL: `${browserOrigin}/dashboard`,
					}),
				}),
			);
			expect(start.status).toBe(200);
			const { url } = (await start.json()) as { url: string };
			const state = new URL(url).searchParams.get("state");
			expect(state).toBeTruthy();
			const cookie = start.headers
				.getSetCookie()
				.map((value) => value.split(";")[0])
				.join("; ");

			const callback = await handleAuthRequest(
				new Request(
					`${origin}/api/auth/oauth2/callback/kick?code=kick-code&state=${state}`,
					{ headers: { cookie } },
				),
			);
			expect(callback.status).toBe(302);
			expect(callback.headers.get("location")).not.toContain("error");

			const created = await db.query.user.findFirst({
				where: eq(user.email, placeholder),
			});
			expect(created).toBeDefined();
			const linked = await db.query.account.findFirst({
				where: eq(account.accountId, kickId),
			});
			expect(linked?.providerId).toBe("kick");
			expect(linked?.userId).toBe(created?.id);
		},
	);
});
