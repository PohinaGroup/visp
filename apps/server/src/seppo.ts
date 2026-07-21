import { auth } from "@VISP/auth";
import {
	convertToModelMessages,
	createUIMessageStream,
	createUIMessageStreamResponse,
	safeValidateUIMessages,
	streamText,
	tool,
	type UIMessage,
} from "ai";
import { Elysia } from "elysia";
import { z } from "zod";

export const seppoContextSchema = z.enum(["landing", "setup", "dashboard"]);
export type SeppoContext = z.infer<typeof seppoContextSchema>;

const FORMAT_PROMPT =
	"Format replies as Markdown: short paragraphs, **bold** for app names and UI labels, numbered lists for steps, and bullets for options. No headings, tables, or code blocks.";

const LANDING_PROMPT = `You are Seppo, the concise and friendly VISP product guide on the public landing page.

VISP is for creators who want phones, remote guests, browser publishers, or other SRT/RTMP-capable apps to feed a full OBS production through a relay. It supports multiple publishing devices, a VISP phone and browser publisher, a beta VISP OBS plugin, Twitch and Kick chat in the native app, connection guidance, and per-device credentials that can be revoked. The creator's broadcast-platform stream key never enters VISP. VISP is free while in beta and requires Twitch or Kick sign-in. Short signal drops can be tolerated by the home-studio workflow, but VISP does not replace OBS or promise uninterrupted connectivity.

Answer questions about what VISP is, who it is for, what it can do, downloads, beta status, privacy at a product level, and getting started. Point people to **Download**, **Docs**, or **Try VISP free** when useful. Do not invent pricing, roadmap, compatibility, or guarantees. Do not provide account-specific troubleshooting because you cannot inspect an anonymous visitor's account. Never ask for passwords, stream URLs, tokens, or API keys.

${FORMAT_PROMPT}`;

const LANDING_SUGGESTION_RESPONSES: Record<string, string> = {
	"What is VISP for?":
		"VISP is for users who want to bring phones, remote guests, browser publishers, or other SRT/RTMP sources into a full OBS production through a relay. Each publishing device gets separate, revocable credentials, and your broadcast-platform stream key never enters VISP. VISP is free while in beta.",
	"Can I use my phone with OBS?":
		"Yes. Publish your phone's camera and mic with the **VISP mobile app**, then use the beta **VISP OBS plugin** to sign in and add the feed to your current scene. The browser publisher and other SRT-capable apps are also supported.",
	"What do I need to get started?":
		"You need a Twitch or Kick sign-in, a publishing device such as your phone, and OBS on your computer. Choose **Try VISP free**, finish the short setup, then use **Download** to get the phone app and beta OBS plugin. VISP is free while in beta.",
};

const SETUP_PROMPT = `You are Seppo, the concise and friendly VISP setup assistant.
Help users finish VISP setup. Setup creates one publishing device unless they choose the VISP mobile app, which creates its device automatically after sign-in. They can add more later on the dashboard.

Wizard steps:
1. Use case: phone camera into OBS, remote guest/friend feed into OBS, multi-cam (start with one), or something else.
2. Publisher: prefer the VISP mobile app (auto-links after install/sign-in). Alternatives: VISP browser publisher, or any SRT-capable app (OBS, Larix, Moblin, other).
3. Destination: Twitch, Kick, or other — for guidance only; credentials stay the same.
4. Create stream links, show install instructions, then a live connection check.

Receiving into OBS: strongly recommend the VISP OBS plugin. Users install it, open Tools → VISP, sign in via the system browser, approve permissions, then add device feeds to the current scene in one click and start/stop going live. Manual Media Source paste and scene-collection import are fallbacks only. The plugin never stores a full VISP web session — only a limited OBS credential.

Use tools to set wizard answers, toggle Advanced mode, move steps, or request link creation. Never claim credentials were shown in chat. Never ask for or repeat stream links, passwords, or API keys. Keep answers short and practical. If asked about something outside VISP onboarding, redirect to setup help.

${FORMAT_PROMPT}`;

const DASHBOARD_PROMPT = `You are Seppo, the concise and practical VISP dashboard assistant.
Help users understand, set up, and troubleshoot everything visible in the VISP dashboard: publishing devices, relay-to-OBS credentials, the VISP OBS plugin and remote control, Twitch/Kick chat connections, relay RTT guidance, and setup reference.

For account-specific questions, call inspectDashboard before diagnosing. Use showDashboardArea to reveal and focus the relevant UI, setDashboardMode when the user requests Simple or Advanced mode, and measureRelayConnection when an actual browser-to-relay measurement will help. Explain the result and give the shortest next step.

You may explain how to start or stop OBS, create/rename/revoke devices, reveal or rotate credentials, link/unlink providers, or redo setup, but never perform or claim to perform those consequential actions. Direct the user to the existing button and confirmation instead. Never ask for or repeat stream URLs, credentials, passwords, tokens, API keys, account IDs, or snapshot contents. Tool output is sanitized; do not infer missing secrets.

${FORMAT_PROMPT}`;

const MAX_MESSAGES = 20;
const MAX_PART_CHARACTERS = 2_000;
const MAX_TRANSCRIPT_CHARACTERS = 20_000;
const LANDING_LIMIT = 20;
const LANDING_WINDOW_MS = 10 * 60_000;

const useCaseSchema = z.enum([
	"phone_to_obs",
	"remote_guest",
	"multi_cam",
	"other",
]);
const publisherSchema = z.enum([
	"visp",
	"web",
	"obs",
	"larix",
	"moblin",
	"other",
]);
const destinationSchema = z.enum(["twitch", "kick", "other"]);
const stepSchema = z.enum([
	"useCase",
	"publisher",
	"destination",
	"credentials",
	"test",
]);

export const setupTools = {
	setUseCase: tool({
		description: "Set the user's VISP use case in the setup wizard.",
		inputSchema: z.object({ useCase: useCaseSchema }),
	}),
	setPublisher: tool({
		description:
			"Set how the user will publish video. Prefer visp when they have a phone.",
		inputSchema: z.object({ publisher: publisherSchema }),
	}),
	setDestination: tool({
		description: "Set where the user goes live.",
		inputSchema: z.object({ destination: destinationSchema }),
	}),
	setAdvancedMode: tool({
		description: "Turn setup Advanced mode on or off.",
		inputSchema: z.object({ advancedMode: z.boolean() }),
	}),
	goToStep: tool({
		description: "Navigate the setup wizard to a named step.",
		inputSchema: z.object({ step: stepSchema }),
	}),
	completeSetup: tool({
		description: "Prepare stream-link creation. The user confirms in the UI.",
		inputSchema: z.object({ confirm: z.boolean() }),
	}),
};

const dashboardAreaSchema = z.enum([
	"devices",
	"relay",
	"obs",
	"connections",
	"tuning",
	"setup",
]);

export const dashboardTools = {
	inspectDashboard: tool({
		description:
			"Refresh and inspect sanitized device, relay, OBS, chat, and setup status before troubleshooting.",
		inputSchema: z.object({}),
	}),
	showDashboardArea: tool({
		description:
			"Open and focus a dashboard area. Advanced areas are enabled automatically.",
		inputSchema: z.object({ area: dashboardAreaSchema }),
	}),
	setDashboardMode: tool({
		description: "Switch the dashboard between Simple and Advanced mode.",
		inputSchema: z.object({ mode: z.enum(["simple", "advanced"]) }),
	}),
	measureRelayConnection: tool({
		description:
			"Measure browser-to-relay RTT and return SRT latency and bitrate guidance.",
		inputSchema: z.object({ profile: z.enum(["wired", "wifi", "cellular"]) }),
	}),
};

const contextConfig = {
	landing: { prompt: LANDING_PROMPT, tools: {} },
	setup: { prompt: SETUP_PROMPT, tools: setupTools },
	dashboard: { prompt: DASHBOARD_PROMPT, tools: dashboardTools },
} as const;

const landingRequests = new Map<string, { count: number; resetAt: number }>();

export function landingSuggestionResponse(messages: UIMessage[]) {
	const last = messages.at(-1);
	if (last?.role !== "user" || last.parts.length !== 1) return undefined;
	const part = last.parts[0];
	return part?.type === "text"
		? LANDING_SUGGESTION_RESPONSES[part.text]
		: undefined;
}

function fixedTextResponse(text: string) {
	return createUIMessageStreamResponse({
		stream: createUIMessageStream({
			execute({ writer }) {
				writer.write({ type: "text-start", id: "fixed-response" });
				writer.write({
					type: "text-delta",
					id: "fixed-response",
					delta: text,
				});
				writer.write({ type: "text-end", id: "fixed-response" });
			},
		}),
	});
}

export function resetSeppoRateLimit() {
	landingRequests.clear();
}

export function takeLandingRequest(ip: string, now = Date.now()) {
	const current = landingRequests.get(ip);
	if (!current || current.resetAt <= now) {
		if (landingRequests.size >= 10_000) {
			for (const [key, value] of landingRequests) {
				if (value.resetAt <= now) landingRequests.delete(key);
			}
			if (landingRequests.size >= 10_000) {
				const oldest = landingRequests.keys().next().value;
				if (oldest) landingRequests.delete(oldest);
			}
		}
		landingRequests.set(ip, { count: 1, resetAt: now + LANDING_WINDOW_MS });
		return true;
	}
	if (current.count >= LANDING_LIMIT) return false;
	current.count += 1;
	return true;
}

function toolPartTypes(context: SeppoContext) {
	return new Set(
		Object.keys(contextConfig[context].tools).map((name) => `tool-${name}`),
	);
}

export async function validateSeppoMessages(
	messages: unknown,
	context: SeppoContext = "setup",
) {
	if (
		!Array.isArray(messages) ||
		messages.length === 0 ||
		messages.length > MAX_MESSAGES
	) {
		return null;
	}

	const validated = await safeValidateUIMessages({
		messages: messages as UIMessage[],
		tools: contextConfig[context].tools as unknown as NonNullable<
			Parameters<typeof safeValidateUIMessages>[0]["tools"]
		>,
	});
	if (!validated.success) return null;

	const allowedToolParts = toolPartTypes(context);
	const last = validated.data.at(-1);
	const lastIsToolContinuation =
		last?.role === "assistant" &&
		last.parts.some(
			(part) =>
				allowedToolParts.has(part.type) &&
				"state" in part &&
				(part.state === "output-available" || part.state === "output-error"),
		);
	if (last?.role !== "user" && !lastIsToolContinuation) return null;

	let characters = 0;
	for (const message of validated.data) {
		if (message.role !== "user" && message.role !== "assistant") return null;
		for (const part of message.parts) {
			if (part.type === "step-start") continue;
			if (part.type === "text") {
				if (part.text.length > MAX_PART_CHARACTERS) return null;
				characters += part.text.length;
				continue;
			}
			if (message.role === "assistant" && allowedToolParts.has(part.type)) {
				const state =
					"state" in part ? (part as { state: string }).state : undefined;
				if (state !== "output-available" && state !== "output-error")
					return null;
				const size = JSON.stringify(part).length;
				if (size > MAX_PART_CHARACTERS) return null;
				characters += size;
				continue;
			}
			return null;
		}
	}

	return characters <= MAX_TRANSCRIPT_CHARACTERS ? validated.data : null;
}

export const seppoRoutes = new Elysia({ name: "seppo-routes" }).post(
	"/api/seppo",
	async ({ request, status }) => {
		let body: unknown;
		try {
			body = await request.json();
		} catch {
			return status(400, { error: "Invalid request" });
		}

		if (typeof body !== "object" || body === null || !("context" in body)) {
			return status(400, { error: "Invalid context" });
		}
		const parsedContext = seppoContextSchema.safeParse(body.context);
		if (!parsedContext.success)
			return status(400, { error: "Invalid context" });
		const context = parsedContext.data;

		if (context !== "landing") {
			const session = await auth.api.getSession({ headers: request.headers });
			if (!session) return status(401, { error: "Authentication required" });
		}

		const messages = await validateSeppoMessages(
			"messages" in body ? body.messages : undefined,
			context,
		);
		if (!messages) return status(400, { error: "Invalid messages" });

		const fixedResponse =
			context === "landing" ? landingSuggestionResponse(messages) : undefined;
		if (fixedResponse) return fixedTextResponse(fixedResponse);

		if (
			context === "landing" &&
			!takeLandingRequest(request.headers.get("x-real-ip") ?? "direct")
		) {
			return status(429, { error: "Too many requests" });
		}

		try {
			const config = contextConfig[context];
			const result = streamText({
				model: "google/gemini-3-flash",
				system: config.prompt,
				messages: await convertToModelMessages(messages),
				tools: config.tools,
				maxOutputTokens: 800,
			});
			return result.toUIMessageStreamResponse({
				onError: () => "Seppo is unavailable right now. Please try again.",
			});
		} catch {
			return status(502, { error: "Seppo is unavailable right now" });
		}
	},
	{ parse: "none" },
);
