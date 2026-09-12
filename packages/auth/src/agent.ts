import { agentAuth } from "@better-auth/agent-auth";
import { env } from "@VISP/env/server";

export const STREAMS_READ = "streams:read";
export const AGENT_STREAMS_PATH = "/api/agent/streams";

export const agentAuthPlugin: ReturnType<typeof agentAuth> = agentAuth({
	providerName: "VISP",
	providerDescription: "Read your stream status with your approval.",
	modes: ["delegated"],
	approvalMethods: ["device_authorization"],
	deviceAuthorizationPage: new URL("/auth/agent-approval", env.CORS_ORIGIN).href,
	allowDynamicHostRegistration: false,
	defaultHostCapabilities: [],
	validateCapabilities: (capabilities) => capabilities.every((name) => name === STREAMS_READ),
	capabilities: [{
		name: STREAMS_READ,
		description: "Read your stream names and live status. Does not expose stream keys or allow changes.",
		approvalStrength: "session",
		location: new URL(AGENT_STREAMS_PATH, env.BETTER_AUTH_URL).href,
		input: { type: "object", properties: {}, additionalProperties: false },
	}],
	// ponytail: replay cache is per process; use shared secondaryStorage before running multiple API workers.
	jtiCacheStorage: "memory",
	onEvent: (event) => {
		console.info("Agent authorization", {
			type: event.type,
			actorId: event.actorId,
			agentId: event.agentId,
			hostId: event.hostId,
		});
	},
});
