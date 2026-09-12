import { createContext } from "@VISP/api/context";
import { appRouter } from "@VISP/api/routers/index";
import { auth } from "@VISP/auth";
import { env } from "@VISP/env/server";
import { cors } from "@elysiajs/cors";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import {
	type BetterAuthInstance,
	createAuthMiddleware,
} from "evlog/better-auth";
import { evlog } from "evlog/elysia";
import { audioIsolationRoutes } from "./audio-isolation";
import { agentRoutes } from "./agent";
import { handleAuthRequest } from "./auth-handler";
import { chatRoutes } from "./chat";
import { machineRoutes } from "./machine";
import { multiChatRoutes } from "./multichat";
import { nodeAdapter } from "./node-adapter";
import { obsLiveRoutes } from "./obs-live";
import { seppoRoutes } from "./seppo";
import { subtitlesRoutes } from "./subtitles";
import { ttsRoutes } from "./tts";
import { typographyRoutes } from "./typography";

initLogger({ env: { service: "VISP-server" } });

// Production runs under Node (`node dist/index.mjs`). Bun's native adapter is
// unavailable there, and Bun itself segfaults on Postgres TLS, so always use
// the Node adapter (srvx/crossws) for listen + WebSocket.

export const LOG_REDACTION_PATHS = [
	"**.code",
	"**.user_code",
	"**.enrollmentToken",
	"**.enrollment_token",
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
	"**.url",
	"**.encryptedUrl",
	"**.stream_key",
	// Presigned BRB card URLs are bearer credentials for the object store.
	"**.backgroundUrl",
	"**.imageUrl",
	// Public affiliate applications contain contact details and creator notes.
	"**.applicantName",
	"**.email",
	"**.youtubeChannelUrl",
	"**.relevantVideoUrl",
	"**.audienceAndSetup",
];

const identifyUser = createAuthMiddleware(auth as BetterAuthInstance, {
	exclude: [
		"/api/agent/**",
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
	return new Elysia({ adapter: nodeAdapter })
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
					env.TYPOGRAPHY_ORIGIN ?? "https://typography.visp-stream.com",
					"https://typography.visp.localhost",
					env.ADMIN_ORIGIN,
					env.MULTICHAT_ORIGIN,
					env.NATIVE_WEB_ORIGIN,
					env.OBS_REMOTE_WEB_ORIGIN,
				],
				methods: ["GET", "POST", "PUT", "OPTIONS"],
				allowedHeaders: ["Content-Type", "Authorization", "X-Hook-Secret"],
				credentials: true,
			}),
		)
		.use(chatRoutes)
		.use(agentRoutes)
		.use(multiChatRoutes)
		.use(machineRoutes)
		.use(obsLiveRoutes)
		.use(seppoRoutes)
		.use(ttsRoutes)
		.use(audioIsolationRoutes)
		.use(subtitlesRoutes)
		.use(typographyRoutes)
		.get("/api/auth/google-local-callback", ({ request }) => {
			const incoming = new URL(request.url);
			const callback = new URL(
				"/api/auth/callback/google",
				env.BETTER_AUTH_URL,
			);
			callback.search = incoming.search;
			return Response.redirect(callback.toString(), 302);
		})
		.all("/api/auth/*", async ({ request, status: responseStatus }) => {
			if (["POST", "GET"].includes(request.method)) {
				return handleAuthRequest(request);
			}
			return responseStatus(405);
		})
		.all("/trpc/*", async (context) => {
			const response = await fetchRequestHandler({
				endpoint: "/trpc",
				router: appRouter,
				req: context.request,
				createContext: () => createContext({ context }),
			});
			// evlog logs `set.status || 200`, and a handler that returns a Response
			// never touches `set`, so every failing tRPC call was logged as 200 —
			// which hid a client retrying a 404 once a second for a whole stream.
			context.set.status = response.status;
			return response;
		})
		.get("/", () => "OK");
}

export const app = createApp();
