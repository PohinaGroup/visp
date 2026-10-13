import { describe, expect, test } from "bun:test";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { admin } from "better-auth/plugins";
import { kickPlaceholderEmail } from "./kick-user-info";
import {
	isPlaceholderEmail,
	PLACEHOLDER_EMAIL_DOMAIN,
	reservedEmailDomains,
} from "./reserved-email";

describe("isPlaceholderEmail", () => {
	test("matches every spelling of the placeholder domain", () => {
		for (const email of [
			kickPlaceholderEmail("42"),
			"kick-42@users.noreply.visp-stream.com",
			"KICK-42@USERS.NOREPLY.VISP-STREAM.COM",
			"  kick-42@users.noreply.visp-stream.com  ",
			"kick-42+x@users.noreply.visp-stream.com",
			"anything@users.noreply.visp-stream.com.",
			"a@deeper.users.noreply.visp-stream.com",
			'"odd@local"@users.noreply.visp-stream.com',
			// Fullwidth letters fold to ASCII under NFKC.
			"kick-42@ｕｓｅｒｓ.noreply.visp-stream.com",
		]) {
			expect(isPlaceholderEmail(email)).toBe(true);
		}
	});

	test("leaves other addresses alone", () => {
		for (const email of [
			"streamer@example.com",
			"kick-42@visp-stream.com",
			"kick-42@noreply.visp-stream.com",
			"kick-42@users.noreply.visp-stream.com.evil.test",
			"kick-42@xusers.noreply.visp-stream.com",
			`${PLACEHOLDER_EMAIL_DOMAIN}@example.com`,
			"no-at-sign",
			undefined,
			null,
			42,
		]) {
			expect(isPlaceholderEmail(email)).toBe(false);
		}
	});
});

describe("reservedEmailDomains", () => {
	function createTestAuth(guarded = true) {
		type Row = Record<string, unknown>;
		const db = {
			user: [] as Row[],
			session: [] as Row[],
			account: [] as Row[],
			verification: [] as Row[],
		};
		return {
			db,
			auth: betterAuth({
				database: memoryAdapter(db),
				secret: "reserved-email-test-secret-at-least-32-characters",
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true, minPasswordLength: 10 },
				user: { changeEmail: { enabled: true } },
				plugins: guarded ? [reservedEmailDomains(), admin()] : [admin()],
				logger: { disabled: true },
			}),
		};
	}

	test("refuses sign-up with a placeholder address and creates no user", async () => {
		const { auth, db } = createTestAuth();
		for (const email of [
			kickPlaceholderEmail("12345"),
			"Kick-12345@Users.NoReply.Visp-Stream.com",
			"kick-12345+a@users.noreply.visp-stream.com",
		]) {
			const response = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-up/email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email,
						name: "Attacker",
						password: "correct-horse-battery",
					}),
				}),
			);
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				code: "INVALID_EMAIL",
				message: "Invalid email",
			});
		}
		expect(db.user).toHaveLength(0);
	});

	test("still allows ordinary sign-up", async () => {
		const { auth, db } = createTestAuth();
		const result = await auth.api.signUpEmail({
			body: {
				email: "streamer@example.com",
				name: "Streamer",
				password: "correct-horse-battery",
			},
		});
		expect(result.user.email).toBe("streamer@example.com");
		expect(db.user).toHaveLength(1);
	});

	test("refuses changing to a placeholder address", async () => {
		const { auth, db } = createTestAuth();
		const { token } = await auth.api.signUpEmail({
			body: {
				email: "streamer@example.com",
				name: "Streamer",
				password: "correct-horse-battery",
			},
		});
		expect(token).toBeTruthy();
		await expect(
			auth.api.changeEmail({
				body: { newEmail: kickPlaceholderEmail("12345") },
				headers: new Headers({ authorization: `Bearer ${token}` }),
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_EMAIL" } });
		expect(db.user[0]?.email).toBe("streamer@example.com");
	});

	test("the unguarded setup would accept the placeholder", async () => {
		const { auth, db } = createTestAuth(false);
		await auth.api.signUpEmail({
			body: {
				email: kickPlaceholderEmail("12345"),
				name: "Attacker",
				password: "correct-horse-battery",
			},
		});
		expect(db.user).toHaveLength(1);
	});

	test("refuses placeholder addresses from admin create-user and update-user", async () => {
		const { auth, db } = createTestAuth();
		await expect(
			auth.api.createUser({
				body: {
					email: kickPlaceholderEmail("12345"),
					name: "Created",
					password: "correct-horse-battery",
				},
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_EMAIL" } });
		expect(db.user).toHaveLength(0);

		const { user } = await auth.api.createUser({
			body: {
				email: "created@example.com",
				name: "Created",
				password: "correct-horse-battery",
			},
		});
		await expect(
			auth.api.adminUpdateUser({
				body: {
					userId: user.id,
					data: { email: kickPlaceholderEmail("12345") },
				},
			}),
		).rejects.toMatchObject({ body: { code: "INVALID_EMAIL" } });
		expect(db.user[0]?.email).toBe("created@example.com");
	});

	test("matches only endpoints that take an email from the caller", () => {
		const [hook] = reservedEmailDomains().hooks.before;
		type Ctx = Parameters<NonNullable<typeof hook>["matcher"]>[0];
		for (const path of [
			"/sign-up/email",
			"/change-email",
			"/update-user",
			"/admin/create-user",
			"/admin/update-user",
		]) {
			expect(hook?.matcher({ path } as Ctx)).toBe(true);
		}
		for (const path of ["/sign-in/email", "/callback/kick", "/get-session"]) {
			expect(hook?.matcher({ path } as Ctx)).toBe(false);
		}
	});
});
