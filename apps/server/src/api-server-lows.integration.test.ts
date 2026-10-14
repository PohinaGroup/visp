import "./test-env";

import {
	issueChatOverlayToken,
	revokeChatOverlayToken,
} from "@VISP/api/chat/overlay-token";
import { chatTickets } from "@VISP/api/chat/tickets";
import { rotateObsControlToken } from "@VISP/api/obs-control";
import { obsLiveTickets } from "@VISP/api/obs-live";
import { submitRtt } from "@VISP/api/relay";
import { db } from "@VISP/db";
import {
	appUser,
	session as authSession,
	relay,
	rttSample,
	user,
} from "@VISP/db/schema/index";
import {
	afterAll,
	beforeAll,
	test as bunTest,
	describe,
	expect,
	spyOn,
} from "bun:test";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { chatRoutes, revalidateChatOverlaySockets } from "./chat";
import { machineRoutes } from "./machine";
import { multiChatRoutes } from "./multichat";
import { nodeAdapter } from "./node-adapter";
import { obsLiveRoutes, revalidateObsLiveSockets } from "./obs-live";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;

const suffix = crypto.randomUUID().slice(0, 8);
const userId = `lows-user-${suffix}`;
const relayName = `lows-relay-${suffix}`;

async function listen() {
	const liveApp = new Elysia({ adapter: nodeAdapter })
		.use(obsLiveRoutes)
		.use(chatRoutes);
	const server = await new Promise<NonNullable<typeof liveApp.server>>(
		(resolve) =>
			liveApp.listen({ hostname: "127.0.0.1", port: 0 }, (value) =>
				resolve(value),
			),
	);
	const port = (
		server as unknown as {
			raw?: { bun?: { server?: { address?: { port?: number } } } };
		}
	).raw?.bun?.server?.address?.port;
	if (!port) throw new Error("test server did not start");
	return { port, stop: () => server.stop(true) };
}

async function open(url: string) {
	const socket = new WebSocket(url);
	const closed = new Promise<number>((resolve) => {
		socket.onclose = ({ code }) => resolve(code);
	});
	await new Promise<void>((resolve, reject) => {
		socket.onopen = () => resolve();
		socket.onerror = () => reject(new Error("socket did not open"));
	});
	// Let the server-side open handler finish its async work.
	await new Promise((resolve) => setTimeout(resolve, 100));
	return { socket, closed };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 150));

integration("api/server hardening", () => {
	let relayId: number;

	beforeAll(async () => {
		await db
			.insert(user)
			.values({ id: userId, name: "Lows", email: `${userId}@example.test` });
		await db.insert(appUser).values({ id: userId, handle: userId });
		const [created] = await db
			.insert(relay)
			.values({
				name: relayName,
				host: "relay.test",
				apiUrl: "http://relay.test:9997",
				pingUrl: "https://relay.test/ping",
				region: "test",
				capacityPaths: 10,
				maxForwarders: 4,
				publicIp: "192.0.2.10",
			})
			.returning({ id: relay.id });
		if (!created) throw new Error("relay insert returned no row");
		relayId = created.id;
	});

	afterAll(async () => {
		await db.delete(user).where(eq(user.id, userId));
		await db.delete(relay).where(eq(relay.id, relayId));
	});

	test("submitRtt stores at most one probe per user per window", async () => {
		const input = {
			method: "manual" as const,
			profile: "wired" as const,
			relayId,
			rttMs: 42,
			userId,
		};
		const first = await submitRtt(input);
		const second = await submitRtt({ ...input, rttMs: 43 });
		// Guidance is still answered for the throttled call.
		expect(second.bitrateKbps).toEqual(first.bitrateKbps);
		const rows = await db
			.select({ rttMs: rttSample.rttMs })
			.from(rttSample)
			.where(eq(rttSample.userId, userId));
		expect(rows).toEqual([{ rttMs: 42 }]);
	});

	test("relay hooks answer 503, never 410 or 500, when the lookup fails", async () => {
		const app = new Elysia().use(machineRoutes);
		const post = (path: string, body: unknown) =>
			app.handle(
				new Request(`http://localhost${path}`, {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-hook-secret": process.env.HOOK_SECRET ?? "",
					},
					body: JSON.stringify(body),
				}),
			);
		const select = spyOn(db, "select").mockImplementation(() => {
			throw new Error("database unavailable");
		});
		try {
			const responses = await Promise.all([
				post("/api/hooks/direct-active", {
					path: "missing",
					provider: "twitch",
					role: "landscape",
				}),
				post("/api/hooks/direct-active-v3", {
					path: "missing",
					outputId: "missing",
					filter: null,
				}),
				post("/api/hooks/relay-health", {
					relay: relayName,
					cpuCount: 1,
					load1: 0,
					load5: 0,
					load15: 0,
					memTotalKb: 1,
					memAvailableKb: 1,
					diskTotalKb: 1,
					diskAvailableKb: 1,
					uptimeSeconds: 1,
				}),
			]);
			expect(responses.map((response) => response.status)).toEqual([
				503, 503, 503,
			]);
		} finally {
			select.mockRestore();
		}
	});

	test("multichat overlay ticket answers 503 when the lookup fails", async () => {
		const app = new Elysia().use(multiChatRoutes);
		const query = spyOn(
			db.query.multiChatOverlay,
			"findFirst",
		).mockImplementation(() => {
			throw new Error("database unavailable");
		});
		try {
			const response = await app.handle(
				new Request("http://localhost/api/multichat/overlay/ticket", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						token: `${"a".repeat(24)}.${"b".repeat(64)}`,
					}),
				}),
			);
			expect(response.status).toBe(503);
		} finally {
			query.mockRestore();
		}
	});

	test("OBS live closes a machine socket that floods reports", async () => {
		const pairing = await rotateObsControlToken(userId);
		const server = await listen();
		try {
			const ticketResponse = await fetch(
				`http://127.0.0.1:${server.port}/api/obs/live-ticket`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${pairing.token}` },
				},
			);
			const { ticket } = (await ticketResponse.json()) as { ticket: string };
			const { socket, closed } = await open(
				`ws://127.0.0.1:${server.port}/api/obs/live?ticket=${encodeURIComponent(ticket)}`,
			);
			const report = JSON.stringify({
				appliedVersion: 0,
				streaming: false,
				scenes: ["Main"],
				currentScene: "Main",
			});
			for (let index = 0; index < 40; index += 1) socket.send(report);
			expect(await closed).toBe(1008);
		} finally {
			server.stop();
		}
	});

	test("OBS live sockets close once their credential is gone", async () => {
		const pairing = await rotateObsControlToken(userId);
		await db.insert(authSession).values({
			id: `lows-session-${suffix}`,
			token: `lows-session-token-${suffix}`,
			userId,
			expiresAt: new Date(Date.now() + 60 * 60_000),
			updatedAt: new Date(),
		});
		const server = await listen();
		try {
			const ticketResponse = await fetch(
				`http://127.0.0.1:${server.port}/api/obs/live-ticket`,
				{
					method: "POST",
					headers: { authorization: `Bearer ${pairing.token}` },
				},
			);
			const { ticket: machineTicket } = (await ticketResponse.json()) as {
				ticket: string;
			};
			const machine = await open(
				`ws://127.0.0.1:${server.port}/api/obs/live?ticket=${encodeURIComponent(machineTicket)}`,
			);
			const { ticket: userTicket } = obsLiveTickets.issue({
				role: "user",
				userId,
			});
			const viewer = await open(
				`ws://127.0.0.1:${server.port}/api/obs/live?ticket=${encodeURIComponent(userTicket)}`,
			);

			await revalidateObsLiveSockets();
			await settled();
			expect(machine.socket.readyState).toBe(WebSocket.OPEN);
			expect(viewer.socket.readyState).toBe(WebSocket.OPEN);

			// Signing out everywhere deletes the session rows.
			await db.delete(authSession).where(eq(authSession.userId, userId));
			await revalidateObsLiveSockets();
			expect(await viewer.closed).toBe(1008);
			expect(machine.socket.readyState).toBe(WebSocket.OPEN);

			// Rotating the OBS token retires the old machine credential.
			await rotateObsControlToken(userId);
			await revalidateObsLiveSockets();
			expect(await machine.closed).toBe(1008);
		} finally {
			server.stop();
		}
	});

	test("revoking the chat overlay token closes overlay sockets only", async () => {
		const { token } = await issueChatOverlayToken(userId);
		const server = await listen();
		try {
			const ticketResponse = await fetch(
				`http://127.0.0.1:${server.port}/api/chat/overlay/ticket`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ token }),
				},
			);
			expect(ticketResponse.status).toBe(200);
			const { ticket } = (await ticketResponse.json()) as { ticket: string };
			const overlay = await open(
				`ws://127.0.0.1:${server.port}/api/chat/live?ticket=${encodeURIComponent(ticket)}`,
			);
			const dashboard = await open(
				`ws://127.0.0.1:${server.port}/api/chat/live?ticket=${encodeURIComponent(chatTickets.issue(userId).ticket)}`,
			);

			await revalidateChatOverlaySockets();
			await settled();
			expect(overlay.socket.readyState).toBe(WebSocket.OPEN);

			await revokeChatOverlayToken(userId);
			await revalidateChatOverlaySockets();
			expect(await overlay.closed).toBe(1008);
			await settled();
			expect(dashboard.socket.readyState).toBe(WebSocket.OPEN);
			dashboard.socket.close();
		} finally {
			server.stop();
		}
	});
});
