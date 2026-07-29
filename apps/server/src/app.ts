import { createContext } from "@VISP/api/context";
import { appRouter } from "@VISP/api/routers/index";
import { auth } from "@VISP/auth";
import { env } from "@VISP/env/server";
import { node } from "@elysia/node";
import { cors } from "@elysiajs/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";
import { evlog } from "evlog/elysia";
import { chatRoutes } from "./chat";
import { machineRoutes } from "./machine";
import { obsLiveRoutes } from "./obs-live";
import { seppoRoutes } from "./seppo";

initLogger({ env: { service: "VISP-server" } });

// Production runs under Node (`node dist/index.mjs`). Bun's native adapter is
// unavailable there, and Bun itself segfaults on Postgres TLS, so always use
// the Node adapter (srvx/crossws) for listen + WebSocket.

export const LOG_REDACTION_PATHS = [
	"**.password",
	"**.accessToken",
	"**.access_token",
	"**.refreshToken",
	"**.ticket",
	"**.token",
	"**.device_code",
	"**.authorization",
	"**.x-hook-secret",
	// VISP Direct destination URLs embed the platform stream key.
	"**.destinations",
	"**.stream_key",
];

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
	exclude: [
		"/api/auth/**",
		"/api/chat/**",
		"/api/mediamtx/**",
		"/api/obs/**",
		"/api/hooks/**",
		"/api/webhooks/**",
	],
	maskEmail: true,
});

export function createApp() {
	return new Elysia({ adapter: node() })
		.use(
			evlog({
				redact: { paths: LOG_REDACTION_PATHS },
			}),
		)
		.derive(async ({ request, log }) => {
			await identifyUser(log, request.headers, new URL(request.url).pathname);
			return {};
		})
		.use(
			cors({
				origin: [
					env.CORS_ORIGIN,
					env.ADMIN_ORIGIN,
					env.NATIVE_WEB_ORIGIN,
					env.OBS_REMOTE_WEB_ORIGIN,
				],
				methods: ["GET", "POST", "OPTIONS"],
				allowedHeaders: ["Content-Type", "Authorization", "X-Hook-Secret"],
				credentials: true,
			}),
		)
		.use(chatRoutes)
		.use(machineRoutes)
		.use(obsLiveRoutes)
		.use(seppoRoutes)
		.all("/api/auth/*", async ({ request, status: responseStatus }) => {
			if (["POST", "GET"].includes(request.method)) {
				return auth.handler(request);
			}
			return responseStatus(405);
		})
		.all("/trpc/*", async (context) => {
			return fetchRequestHandler({
				endpoint: "/trpc",
				router: appRouter,
				req: context.request,
				createContext: () => createContext({ context }),
			});
		})
		.get("/", () => "OK");
}

export const app = createApp();
