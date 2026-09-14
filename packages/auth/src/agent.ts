import { env } from "@VISP/env/server";
import { agentAuth } from "@better-auth/agent-auth";

export const STREAMS_READ = "streams:read";
export const STREAM_HEALTH_READ = "stream-health:read";
export const DIRECT_READ = "direct:read";
export const OBS_READ = "obs:read";
export const CHANNEL_UPDATE = "channel:update";
export const OBS_SCENE_SET = "obs:scene:set";
export const OBS_STREAM_START = "obs:stream:start";
export const OBS_STREAM_STOP = "obs:stream:stop";
export const ACTIONS_READ = "agent-actions:read";
export const AGENT_STREAMS_PATH = "/api/agent/streams";
export const AGENT_STREAM_HEALTH_PATH = "/api/agent/stream-health";
export const AGENT_DIRECT_PATH = "/api/agent/direct";
export const AGENT_OBS_PATH = "/api/agent/obs";
export const AGENT_ACTIONS_PATH = "/api/agent/actions";

const actionCapabilities = [
	{
		name: CHANNEL_UPDATE,
		description: "Propose an exact title or category change for your approval.",
	},
	{
		name: OBS_SCENE_SET,
		description:
			"Propose switching OBS to an available scene for your approval.",
	},
	{
		name: OBS_STREAM_START,
		description: "Propose starting OBS streaming for your approval.",
	},
	{
		name: OBS_STREAM_STOP,
		description: "Propose stopping OBS streaming for your approval.",
	},
	{
		name: ACTIONS_READ,
		description: "Read the outcome of your pending agent action requests.",
	},
] as const;

export const agentAuthPlugin: ReturnType<typeof agentAuth> = agentAuth({
	providerName: "VISP",
	providerDescription:
		"Inspect your stream, connection, Direct, and OBS status with your approval.",
	modes: ["delegated"],
	approvalMethods: ["device_authorization"],
	deviceAuthorizationPage: new URL("/auth/agent-approval", env.CORS_ORIGIN)
		.href,
	allowDynamicHostRegistration: false,
	defaultHostCapabilities: [],
	validateCapabilities: (capabilities) =>
		capabilities.every((name) =>
			[
				STREAMS_READ,
				STREAM_HEALTH_READ,
				DIRECT_READ,
				OBS_READ,
				CHANNEL_UPDATE,
				OBS_SCENE_SET,
				OBS_STREAM_START,
				OBS_STREAM_STOP,
				ACTIONS_READ,
			].includes(name),
		),
	capabilities: [
		{
			name: STREAMS_READ,
			description:
				"Read your stream names and live status. Does not expose stream keys or allow changes.",
			approvalStrength: "session",
			location: new URL(AGENT_STREAMS_PATH, env.BETTER_AUTH_URL).href,
			input: { type: "object", properties: {}, additionalProperties: false },
		},
		{
			name: STREAM_HEALTH_READ,
			description: "Read recent connection health for your streaming devices.",
			approvalStrength: "session",
			location: new URL(AGENT_STREAM_HEALTH_PATH, env.BETTER_AUTH_URL).href,
			input: { type: "object", properties: {}, additionalProperties: false },
		},
		{
			name: DIRECT_READ,
			description:
				"Read Direct destination state and errors. Does not expose destination URLs or stream keys.",
			approvalStrength: "session",
			location: new URL(AGENT_DIRECT_PATH, env.BETTER_AUTH_URL).href,
			input: { type: "object", properties: {}, additionalProperties: false },
		},
		{
			name: OBS_READ,
			description:
				"Read OBS connection and broadcast state. Does not allow OBS control.",
			approvalStrength: "session",
			location: new URL(AGENT_OBS_PATH, env.BETTER_AUTH_URL).href,
			input: { type: "object", properties: {}, additionalProperties: false },
		},
		...actionCapabilities.map(({ name, description }) => ({
			name,
			description,
			approvalStrength: "session" as const,
			location: new URL(AGENT_ACTIONS_PATH, env.BETTER_AUTH_URL).href,
			input: { type: "object", additionalProperties: true },
		})),
	],
	jtiCacheStorage: "secondary-storage",
	jwksCacheStorage: "secondary-storage",
	onEvent: (event) => {
		console.info("Agent authorization", {
			type: event.type,
			actorId: event.actorId,
			agentId: event.agentId,
			hostId: event.hostId,
		});
	},
});
