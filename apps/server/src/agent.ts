import {
	agentActionCapability,
	agentActionInput,
} from "@VISP/api/agent-actions";
import { listDirectOutputs } from "@VISP/api/direct";
import { getObsControlStatus } from "@VISP/api/obs-control";
import { fixedWindow } from "@VISP/api/rate-limit";
import { listPaths } from "@VISP/api/relay";
import { auth } from "@VISP/auth";
import {
	ACTIONS_READ,
	AGENT_ACTIONS_PATH,
	AGENT_DIRECT_PATH,
	AGENT_OBS_PATH,
	AGENT_STREAM_HEALTH_PATH,
	AGENT_STREAMS_PATH,
	DIRECT_READ,
	OBS_READ,
	STREAM_HEALTH_READ,
	STREAMS_READ,
} from "@VISP/auth/agent";
import { db } from "@VISP/db";
import { agentAction, agentActivity, user } from "@VISP/db/schema/index";
import { and, eq, gt, lt } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";

const reads = fixedWindow(60, 60_000);
const actions = fixedWindow(10, 60_000);
const input = z.object({}).strict();
const capabilityEnvelope = z
	.object({ capability: z.string(), arguments: z.unknown().optional() })
	.strict();
const actionStatusInput = z.object({
	action: z.literal("status"),
	id: z.uuid(),
});

function unwrapCapabilityRequest(body: unknown, capability: string) {
	const envelope = capabilityEnvelope.safeParse(body);
	if (!envelope.success) return body;
	if (envelope.data.capability !== capability) return null;
	return envelope.data.arguments ?? {};
}

async function requireAgentRequest(
	request: Request,
	capability: string,
	bodySchema: {
		safeParse: (value: unknown) => { success: boolean; data?: unknown };
	} = input,
) {
	let session: Awaited<ReturnType<typeof auth.api.getAgentSession>>;
	try {
		session = await auth.api.getAgentSession({
			headers: request.headers,
			request,
			asResponse: false,
		});
	} catch {
		return Response.json(
			{ error: "Invalid agent credentials" },
			{ status: 401 },
		);
	}
	if (!session)
		return Response.json(
			{ error: "Agent authentication required" },
			{ status: 401 },
		);
	const grant = session.agent.capabilityGrants.find(
		(entry) => entry.capability === capability && entry.status === "active",
	);
	if (
		!grant ||
		(grant.constraints && Object.keys(grant.constraints).length > 0)
	) {
		return Response.json(
			{
				error:
					"Active capability grant required without unsupported constraints",
			},
			{ status: 403 },
		);
	}
	const owner = await db.query.user.findFirst({
		columns: { banned: true },
		where: eq(user.id, session.user.id),
	});
	if (!owner || owner.banned)
		return Response.json({ error: "Account unavailable" }, { status: 403 });
	if (!reads.take(session.user.id))
		return Response.json({ error: "Too many requests" }, { status: 429 });
	const body = await request.json().catch(() => null);
	const parsed = bodySchema.safeParse(
		unwrapCapabilityRequest(body, capability),
	);
	if (new URL(request.url).search || !parsed.success) {
		return Response.json(
			{ error: "Invalid capability request" },
			{ status: 400 },
		);
	}
	const encodedPayload = request.headers.get("authorization")?.split(".")[1];
	if (!encodedPayload)
		return Response.json(
			{ error: "Invalid agent credentials" },
			{ status: 401 },
		);
	let ath: unknown;
	try {
		ath = (
			JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as {
				ath?: unknown;
			}
		).ath;
	} catch {
		return Response.json(
			{ error: "Invalid agent credentials" },
			{ status: 401 },
		);
	}
	if (ath !== undefined) {
		const digest = await crypto.subtle.digest(
			"SHA-256",
			new TextEncoder().encode(JSON.stringify(body)),
		);
		if (ath !== Buffer.from(digest).toString("base64url")) {
			return Response.json(
				{ error: "Request body does not match token" },
				{ status: 401 },
			);
		}
	}
	return {
		agentId: session.agent.id,
		userId: session.user.id,
		input: parsed.data,
	};
}

async function agentRead(
	request: Request,
	capability: string,
	target: string,
	read: (userId: string) => Promise<unknown>,
) {
	const session = await requireAgentRequest(request, capability);
	if (session instanceof Response) return session;
	const data = await read(session.userId);
	await db.insert(agentActivity).values({
		id: crypto.randomUUID(),
		agentId: session.agentId,
		userId: session.userId,
		capability,
		target,
		result: "success",
	});
	return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}

export const agentRoutes = new Elysia({ name: "agent-routes" })
	.get("/.well-known/agent-configuration", () =>
		auth.api.getAgentConfiguration(),
	)
	.post(
		AGENT_STREAMS_PATH,
		({ request }) =>
			agentRead(request, STREAMS_READ, "streams", async (userId) => {
				const streams = await listPaths(userId);
				return {
					observedAt: new Date().toISOString(),
					streams: streams.map(
						({ id, label, publishing, readerCount, lastEventAt }) => ({
							id,
							label,
							publishing: publishing ?? false,
							readerCount: readerCount ?? 0,
							lastEventAt: lastEventAt?.toISOString() ?? null,
						}),
					),
				};
			}),
		{ parse: "none" },
	)
	.post(
		AGENT_STREAM_HEALTH_PATH,
		({ request }) =>
			agentRead(
				request,
				STREAM_HEALTH_READ,
				"stream-health",
				async (userId) => {
					const now = Date.now();
					const streams = await listPaths(userId);
					return {
						observedAt: new Date(now).toISOString(),
						streams: streams.map((stream) => ({
							id: stream.id,
							label: stream.label,
							stale:
								!stream.lastEventAt ||
								now - stream.lastEventAt.getTime() > 60_000,
							lastEventAt: stream.lastEventAt?.toISOString() ?? null,
							linkBitrateKbps: stream.linkBitrateKbps ?? null,
							linkTargetBitrateKbps: stream.linkTargetBitrateKbps ?? null,
							linkRttMs: stream.linkRttMs ?? null,
							linkPacketLossPct: stream.linkPacketLossPct ?? null,
							linkCount: stream.linkCount ?? null,
							linkDegraded: stream.linkDegraded ?? false,
							linkStatsAt: stream.linkStatsAt?.toISOString() ?? null,
						})),
					};
				},
			),
		{ parse: "none" },
	)
	.post(
		AGENT_DIRECT_PATH,
		({ request }) =>
			agentRead(request, DIRECT_READ, "direct", async (userId) => {
				const direct = await listDirectOutputs(userId);
				return {
					observedAt: new Date().toISOString(),
					mode: direct.mode,
					desired: direct.desired,
					destinations: direct.destinations.map(
						({ id, pathId, provider, role, state, error }) => ({
							id,
							pathId,
							provider,
							role,
							state,
							error,
						}),
					),
					customOutputs: direct.customOutputs.map(
						({ id, pathId, name, protocol, role, state, error }) => ({
							id,
							pathId,
							name,
							protocol,
							role,
							state,
							error,
						}),
					),
				};
			}),
		{ parse: "none" },
	)
	.post(
		AGENT_OBS_PATH,
		({ request }) =>
			agentRead(request, OBS_READ, "obs", async (userId) => {
				const obs = await getObsControlStatus(userId);
				return {
					observedAt: new Date().toISOString(),
					configured: obs.configured,
					connected: obs.connected,
					streaming: obs.streaming,
					pending: obs.pending,
					currentScene: obs.currentScene,
					scenes: obs.scenes,
					lastSeenAt: obs.lastSeenAt,
				};
			}),
		{ parse: "none" },
	)
	.post(
		AGENT_ACTIONS_PATH,
		async ({ request }) => {
			const raw = await request
				.clone()
				.json()
				.catch(() => null);
			const status = actionStatusInput.safeParse(
				unwrapCapabilityRequest(raw, ACTIONS_READ),
			);
			if (status.success) {
				const session = await requireAgentRequest(
					request,
					ACTIONS_READ,
					actionStatusInput,
				);
				if (session instanceof Response) return session;
				const [action] = await db
					.select()
					.from(agentAction)
					.where(
						and(
							eq(agentAction.id, status.data.id),
							eq(agentAction.agentId, session.agentId),
							eq(agentAction.userId, session.userId),
						),
					)
					.limit(1);
				if (!action)
					return Response.json({ error: "Action not found" }, { status: 404 });
				if (action.status === "pending" && action.expiresAt <= new Date()) {
					await db
						.update(agentAction)
						.set({ status: "expired", updatedAt: new Date() })
						.where(eq(agentAction.id, action.id));
					action.status = "expired";
				}
				return Response.json(
					{
						id: action.id,
						status: action.status,
						result: action.result ? JSON.parse(action.result) : null,
						expiresAt: action.expiresAt.toISOString(),
					},
					{ headers: { "Cache-Control": "no-store" } },
				);
			}
			const candidate = capabilityEnvelope.safeParse(raw);
			const proposal = agentActionInput.safeParse(
				candidate.success ? candidate.data.arguments : raw,
			);
			if (!proposal.success)
				return Response.json(
					{ error: "Invalid action request" },
					{ status: 400 },
				);
			const capability = agentActionCapability(proposal.data);
			const session = await requireAgentRequest(
				request,
				capability,
				agentActionInput,
			);
			if (session instanceof Response) return session;
			if (!actions.take(session.userId))
				return Response.json({ error: "Too many requests" }, { status: 429 });
			const stored = JSON.stringify(proposal.data);
			await db
				.update(agentAction)
				.set({ status: "expired", updatedAt: new Date() })
				.where(
					and(
						eq(agentAction.agentId, session.agentId),
						eq(agentAction.capability, capability),
						eq(agentAction.input, stored),
						eq(agentAction.status, "pending"),
						lt(agentAction.expiresAt, new Date()),
					),
				);
			const [existing] = await db
				.select({ id: agentAction.id, expiresAt: agentAction.expiresAt })
				.from(agentAction)
				.where(
					and(
						eq(agentAction.agentId, session.agentId),
						eq(agentAction.capability, capability),
						eq(agentAction.input, stored),
						eq(agentAction.status, "pending"),
						gt(agentAction.expiresAt, new Date()),
					),
				)
				.limit(1);
			const created = await db
				.insert(agentAction)
				.values({
					id: crypto.randomUUID(),
					agentId: session.agentId,
					userId: session.userId,
					capability,
					input: stored,
					expiresAt: new Date(Date.now() + 5 * 60_000),
				})
				.onConflictDoNothing()
				.returning({ id: agentAction.id, expiresAt: agentAction.expiresAt });
			const action = existing ?? created[0];
			if (!action)
				return Response.json(
					{ error: "Could not create action" },
					{ status: 409 },
				);
			await db.insert(agentActivity).values({
				id: crypto.randomUUID(),
				agentId: session.agentId,
				userId: session.userId,
				capability,
				target: proposal.data.action,
				result: "pending-approval",
			});
			return Response.json(
				{
					id: action.id,
					status: "pending",
					expiresAt: action.expiresAt.toISOString(),
				},
				{ headers: { "Cache-Control": "no-store" } },
			);
		},
		{ parse: "none" },
	);
