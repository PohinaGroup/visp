import "./test-env";
import { createPath, ensureRelayUser } from "@VISP/api/relay";
import { ensureDefaultRelay } from "@VISP/api/relays";
import { auth } from "@VISP/auth";
import { getProviderAccessToken } from "@VISP/auth/provider-token";
import { db } from "@VISP/db";
import {
	account,
	agentCapabilityGrant,
	agent as agentRecord,
	approvalRequest,
	session,
	user,
} from "@VISP/db/schema/index";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AgentAuthClient, type ProviderConfig } from "@auth/agent";
import { and, eq, inArray } from "drizzle-orm";
import { Elysia } from "elysia";
import { agentRoutes } from "./agent";
import { handleAuthRequest } from "./auth-handler";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const origin = process.env.BETTER_AUTH_URL!;
const browserOrigin = process.env.CORS_ORIGIN!;
const app = new Elysia().use(agentRoutes);
const encode = (value: unknown) =>
	Buffer.from(JSON.stringify(value)).toString("base64url");

integration("Agent authorization", () => {
	const ownerId = `agent-test-${crypto.randomUUID()}`;
	const otherId = `agent-other-${crypto.randomUUID()}`;
	const humanToken = crypto.randomUUID();
	const otherToken = crypto.randomUUID();
	const human = new Headers({
		authorization: `Bearer ${humanToken}`,
		origin: browserOrigin,
	});
	const other = new Headers({
		authorization: `Bearer ${otherToken}`,
		origin: browserOrigin,
	});
	let hostId: string;
	let hostKey: CryptoKeyPair;

	async function jwt(
		key: CryptoKeyPair,
		typ: string,
		claims: Record<string, unknown>,
	) {
		const now = Math.floor(Date.now() / 1000);
		const value = `${encode({ alg: "EdDSA", typ })}.${encode({ iat: now, exp: now + 60, jti: crypto.randomUUID(), aud: `${origin}/api/auth`, ...claims })}`;
		const signature = await crypto.subtle.sign(
			"Ed25519",
			key.privateKey,
			new TextEncoder().encode(value),
		);
		return `${value}.${Buffer.from(signature).toString("base64url")}`;
	}
	async function authRequest(path: string, headers: Headers, body?: unknown) {
		const next = new Headers(headers);
		if (body !== undefined) next.set("content-type", "application/json");
		return handleAuthRequest(
			new Request(`${origin}/api/auth${path}`, {
				method: body === undefined ? "GET" : "POST",
				headers: next,
				body: body === undefined ? undefined : JSON.stringify(body),
			}),
		);
	}
	async function register(capabilities = ["streams:read"]) {
		const key = (await crypto.subtle.generateKey("Ed25519", true, [
			"sign",
			"verify",
		])) as CryptoKeyPair;
		const token = await jwt(hostKey, "host+jwt", {
			iss: hostId,
			agent_public_key: await crypto.subtle.exportKey("jwk", key.publicKey),
		});
		const response = await authRequest(
			"/agent/register",
			new Headers({ authorization: `Bearer ${token}` }),
			{ name: "Test agent", mode: "delegated", capabilities },
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			status: string;
			agent_id: string;
			approval: {
				user_code: string;
				device_code: string;
				verification_uri_complete: string;
			};
		};
		expect(body.status).toBe("pending");
		return {
			key,
			id: body.agent_id as string,
			code: body.approval.user_code as string,
			approvalId: body.approval.device_code as string,
			url: body.approval.verification_uri_complete as string,
			capabilities,
		};
	}
	async function decide(
		agent: Awaited<ReturnType<typeof register>>,
		action = "approve",
		headers = human,
	) {
		return authRequest("/agent/approve-capability", headers, {
			agent_id: agent.id,
			user_code: agent.code,
			action,
			capabilities: agent.capabilities,
		});
	}
	async function read(
		token: string,
		body: unknown = {},
		path = "/api/agent/streams",
	) {
		return app.handle(
			new Request(`${origin}${path}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${token}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(body),
			}),
		);
	}
	async function agentJwt(
		agent: Awaited<ReturnType<typeof register>>,
		claims: Record<string, unknown> = {},
		capabilities = agent.capabilities,
	) {
		return jwt(agent.key, "agent+jwt", {
			sub: agent.id,
			iss: hostId,
			capabilities,
			aud: `${origin}/api/agent/streams`,
			...claims,
		});
	}
	beforeAll(async () => {
		await db.insert(user).values(
			[ownerId, otherId].map((id) => ({
				id,
				name: "Agent test",
				email: `${id}@example.test`,
				emailVerified: true,
			})),
		);
		await db.insert(session).values([
			{
				id: crypto.randomUUID(),
				userId: ownerId,
				token: humanToken,
				expiresAt: new Date(Date.now() + 3600000),
			},
			{
				id: crypto.randomUUID(),
				userId: otherId,
				token: otherToken,
				expiresAt: new Date(Date.now() + 3600000),
			},
		]);
		await db.insert(account).values(
			[ownerId, otherId].map((id) => ({
				id: crypto.randomUUID(),
				userId: id,
				providerId: "credential",
				accountId: id,
			})),
		);
		await ensureDefaultRelay();
		await ensureRelayUser(ownerId, "Agent test");
		await ensureRelayUser(otherId, "Other test");
		await createPath(ownerId, "My stream");
		await createPath(otherId, "Other private stream");
		hostKey = (await crypto.subtle.generateKey("Ed25519", true, [
			"sign",
			"verify",
		])) as CryptoKeyPair;
		const host = await authRequest("/host/create", human, {
			name: "Test host",
			public_key: await crypto.subtle.exportKey("jwk", hostKey.publicKey),
			default_capabilities: [],
		});
		expect(host.status).toBe(200);
		hostId = ((await host.json()) as { hostId: string }).hostId;
	});
	afterAll(async () => {
		await db.delete(user).where(inArray(user.id, [ownerId, otherId]));
	});

	test.serial(
		"approval, scoped execution, replay protection and immediate revocation",
		async () => {
			const agent = await register();
			expect(new URL(agent.url).pathname).toBe("/auth/agent-approval");
			expect(new URL(agent.url).searchParams.get("code")).toBe(agent.code);
			expect((await read(await agentJwt(agent))).status).toBe(401);
			expect((await decide(agent, "approve", other)).status).toBe(403);
			expect(
				(await authRequest(`/agent/get?agent_id=${agent.id}`, other)).status,
			).toBe(404);
			expect((await decide(agent)).status).toBe(200);
			const token = await agentJwt(agent, {
				htm: "POST",
				htu: `${origin}/api/agent/streams`,
			});
			const response = await read(token);
			expect(response.status).toBe(200);
			const data = (await response.json()) as {
				streams: Array<{ label: string }>;
			};
			expect(typeof (data as { observedAt?: unknown }).observedAt).toBe(
				"string",
			);
			expect(data.streams).toHaveLength(1);
			expect(data.streams[0]!.label).toBe("My stream");
			expect(Object.keys(data.streams[0]!).sort()).toEqual([
				"id",
				"label",
				"lastEventAt",
				"publishing",
				"readerCount",
			]);
			expect((await read(token)).status).toBe(401);
			expect(
				(
					await read(
						await agentJwt(agent, {
							capabilities: [],
							aud: `${origin}/api/auth`,
						}),
					)
				).status,
			).toBe(403);
			expect(
				(await read(await agentJwt(agent, { aud: "https://wrong.example" })))
					.status,
			).toBe(401);
			expect((await read(await agentJwt(agent, { exp: 1 }))).status).toBe(401);
			expect(
				(await read(await agentJwt(agent, { ath: "wrong-body-hash" }))).status,
			).toBe(401);
			expect((await read(await agentJwt(agent, { htm: "GET" }))).status).toBe(
				401,
			);
			expect(
				(await read(await agentJwt(agent), { userId: otherId })).status,
			).toBe(400);
			expect(
				await auth.api.getSession({
					headers: new Headers({
						authorization: `Bearer ${await agentJwt(agent)}`,
					}),
				}),
			).toBeNull();
			expect(
				(
					await authRequest("/agent/revoke-capability", other, {
						agent_id: agent.id,
						capabilities: ["streams:read"],
					})
				).status,
			).toBe(403);
			const unusedToken = await agentJwt(agent);
			expect(
				(
					await authRequest("/agent/revoke-capability", human, {
						agent_id: agent.id,
						capabilities: ["streams:read"],
					})
				).status,
			).toBe(200);
			expect((await read(unusedToken)).status).toBe(403);
		},
	);
	test.serial(
		"the @auth/agent SDK enrolls, approves, reads, and is revoked",
		async () => {
			const host = await authRequest("/host/create", human, {
				name: "SDK test host",
				default_capabilities: [],
			});
			expect(host.status).toBe(200);
			const enrollment = (await host.json()) as { enrollmentToken: string };
			const configuration = await authRequest(
				"/agent-configuration",
				new Headers(),
			);
			expect(configuration.status).toBe(200);
			const config = (await configuration.json()) as ProviderConfig;
			const client = new AgentAuthClient({
				providers: [config],
				fetch: ((input: string | URL | Request, init?: RequestInit) => {
					const request =
						input instanceof Request
							? new Request(input, init)
							: new Request(input.toString(), init);
					return new URL(request.url).pathname.startsWith("/api/auth/")
						? handleAuthRequest(request)
						: app.handle(request);
				}) as typeof fetch,
				onApprovalRequired: async (approval) => {
					const pending = await db.query.agent.findFirst({
						columns: { id: true },
						where: and(
							eq(agentRecord.name, "SDK test agent"),
							eq(agentRecord.userId, ownerId),
						),
					});
					if (!pending || !approval.user_code)
						throw new Error("Expected a pending SDK approval.");
					const response = await authRequest(
						"/agent/approve-capability",
						human,
						{
							agent_id: pending.id,
							user_code: approval.user_code,
							action: "approve",
							capabilities: ["streams:read"],
						},
					);
					if (!response.ok) throw new Error("SDK approval failed.");
				},
			});
			try {
				await client.enrollHost({
					provider: config.issuer,
					enrollmentToken: enrollment.enrollmentToken,
				});
				await client.listCapabilities({ provider: config.issuer });
				const connected = await client.connectAgent({
					provider: config.issuer,
					capabilities: ["streams:read"],
					name: "SDK test agent",
				});
				expect(connected.status).toBe("active");
				expect(
					await client.executeCapability({
						agentId: connected.agentId,
						capability: "streams:read",
					}),
				).toMatchObject({ streams: [{ label: "My stream" }] });
				expect(
					(
						await authRequest("/agent/revoke-capability", human, {
							agent_id: connected.agentId,
							capabilities: ["streams:read"],
						})
					).status,
				).toBe(200);
				await expect(
					client.executeCapability({
						agentId: connected.agentId,
						capability: "streams:read",
					}),
				).rejects.toThrow();
			} finally {
				client.destroy();
			}
		},
		10_000,
	);
	test.serial("write capabilities create an expiring proposal", async () => {
		const agent = await register(["channel:update", "agent-actions:read"]);
		expect((await decide(agent)).status).toBe(200);
		const path = "/api/agent/actions";
		const proposalToken = await agentJwt(
			agent,
			{ htm: "POST", htu: `${origin}${path}`, aud: `${origin}${path}` },
			["channel:update"],
		);
		const proposal = await app.handle(
			new Request(`${origin}${path}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${proposalToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ action: "channel-update", title: "Tonight" }),
			}),
		);
		expect(proposal.status).toBe(200);
		const created = (await proposal.json()) as {
			id: string;
			status: string;
			expiresAt: string;
		};
		expect(created.status).toBe("pending");
		expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(Date.now());
		const statusToken = await agentJwt(
			agent,
			{ htm: "POST", htu: `${origin}${path}`, aud: `${origin}${path}` },
			["agent-actions:read"],
		);
		const status = await app.handle(
			new Request(`${origin}${path}`, {
				method: "POST",
				headers: {
					authorization: `Bearer ${statusToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify({ action: "status", id: created.id }),
			}),
		);
		expect(((await status.json()) as { status: string }).status).toBe(
			"pending",
		);
	});
	test.serial(
		"preflight reads require their individual capability and omit credentials",
		async () => {
			const agent = await register([
				"stream-health:read",
				"direct:read",
				"obs:read",
			]);
			expect((await decide(agent)).status).toBe(200);
			for (const [capability, path] of [
				["stream-health:read", "/api/agent/stream-health"],
				["direct:read", "/api/agent/direct"],
				["obs:read", "/api/agent/obs"],
			] as const) {
				const token = await agentJwt(
					agent,
					{ htm: "POST", htu: `${origin}${path}`, aud: `${origin}${path}` },
					[capability],
				);
				const response = await read(token, {}, path);
				expect(response.status).toBe(200);
				expect(JSON.stringify(await response.json())).not.toContain(
					"stream_key",
				);
			}
			const ungranted = await agentJwt(
				agent,
				{ htm: "POST", htu: `${origin}/api/agent/streams` },
				["streams:read"],
			);
			expect((await read(ungranted)).status).toBe(403);
		},
	);
	test.serial(
		"denied and expired approvals cannot authorize execution",
		async () => {
			const denied = await register();
			expect((await decide(denied, "deny")).status).toBe(200);
			expect((await read(await agentJwt(denied))).status).toBe(401);
			const expired = await register();
			await db
				.update(approvalRequest)
				.set({ expiresAt: new Date(0) })
				.where(eq(approvalRequest.id, expired.approvalId));
			expect((await decide(expired)).status).toBe(403);
		},
	);
	test.serial(
		"unsupported constraints and banned accounts fail closed",
		async () => {
			const agent = await register();
			expect((await decide(agent)).status).toBe(200);
			await db
				.update(agentCapabilityGrant)
				.set({ constraints: JSON.stringify({ pathId: { eq: 1 } }) })
				.where(eq(agentCapabilityGrant.agentId, agent.id));
			expect((await read(await agentJwt(agent))).status).toBe(403);
			await db
				.update(agentCapabilityGrant)
				.set({ constraints: null })
				.where(eq(agentCapabilityGrant.agentId, agent.id));
			await db.update(user).set({ banned: true }).where(eq(user.id, ownerId));
			expect((await read(await agentJwt(agent))).status).toBe(403);
			await db.update(user).set({ banned: false }).where(eq(user.id, ownerId));
		},
	);
	test.serial(
		"OAuth tokens use the account database ID and remain owner scoped",
		async () => {
			const id = crypto.randomUUID();
			const ctx = await auth.$context;
			await ctx.internalAdapter.createAccount({
				id,
				userId: ownerId,
				providerId: "twitch",
				accountId: "provider-side-id",
				accessToken: "test-oauth-token",
				accessTokenExpiresAt: new Date(Date.now() + 3600000),
			});
			expect(
				(await getProviderAccessToken("twitch", ownerId)).accessToken,
			).toBe("test-oauth-token");
			await expect(getProviderAccessToken("twitch", otherId)).rejects.toThrow();
			const linked = await db.query.account.findFirst({
				where: (account, { and, eq }) =>
					and(eq(account.userId, ownerId), eq(account.providerId, "twitch")),
			});
			expect(
				(await authRequest("/unlink-account", other, { accountId: linked!.id }))
					.status,
			).toBe(400);
			expect(
				(await authRequest("/unlink-account", human, { providerId: "twitch" }))
					.status,
			).toBe(200);
		},
	);
	test.serial(
		"installed mobile clients keep the registered Kick callback",
		async () => {
			const response = await authRequest("/sign-in/oauth2", human, {
				providerId: "kick",
				callbackURL: `${browserOrigin}/dashboard`,
			});
			expect(response.status).toBe(200);
			const result = (await response.json()) as { url: string };
			expect(new URL(result.url).searchParams.get("redirect_uri")).toBe(
				`${origin}/api/auth/oauth2/callback/kick`,
			);
		},
	);
});
