import { fixedWindow } from "@VISP/api/rate-limit";
import { listPaths } from "@VISP/api/relay";
import { auth } from "@VISP/auth";
import { AGENT_STREAMS_PATH, STREAMS_READ } from "@VISP/auth/agent";
import { db } from "@VISP/db";
import { Elysia } from "elysia";
import { z } from "zod";

const reads = fixedWindow(60, 60_000);
const input = z.object({}).strict();

export const agentRoutes = new Elysia({ name: "agent-routes" })
	.get("/.well-known/agent-configuration", () => auth.api.getAgentConfiguration())
	.post(AGENT_STREAMS_PATH, async ({ request, status }) => {
		let session: Awaited<ReturnType<typeof auth.api.getAgentSession>>;
		try {
			session = await auth.api.getAgentSession({ headers: request.headers, request, asResponse: false });
		} catch {
			return status(401, { error: "Invalid agent credentials" });
		}
		if (!session) return status(401, { error: "Agent authentication required" });
		const grant = session.agent.capabilityGrants.find(
			(grant) => grant.capability === STREAMS_READ && grant.status === "active",
		);
		// This operation has no arguments or supported constraints. Reject rather than ignore limits.
		if (!grant || (grant.constraints && Object.keys(grant.constraints).length > 0)) {
			return status(403, { error: "Stream read capability required without unsupported constraints" });
		}
		const owner = await db.query.user.findFirst({
			columns: { banned: true },
			where: (user, { eq }) => eq(user.id, session.user.id),
		});
		if (!owner || owner.banned) return status(403, { error: "Account unavailable" });
		if (!reads.take(session.user.id)) return status(429, { error: "Too many requests" });
		const body = await request.json().catch(() => null);
		if (new URL(request.url).search || !input.safeParse(body).success) {
			return status(400, { error: "Send an empty JSON object" });
		}
		// getAgentSession verifies the JWT, but its GET endpoint has no body to bind.
		const payload = JSON.parse(Buffer.from(request.headers.get("authorization")!.split(".")[1]!, "base64url").toString()) as { ath?: unknown };
		if (payload.ath !== undefined) {
			const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(body)));
			if (payload.ath !== Buffer.from(digest).toString("base64url")) return status(401, { error: "Request body does not match token" });
		}
		const paths = await listPaths(session.user.id);
		return Response.json({ streams: paths.map(({ id, label, publishing, readerCount, lastEventAt }) => ({
			id, label, publishing: publishing ?? false, readerCount: readerCount ?? 0, lastEventAt,
		})) }, { headers: { "Cache-Control": "no-store" } });
	}, { parse: "none" });
