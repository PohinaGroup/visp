import { z } from "zod";
import { updateStreamInfo } from "./channel/stream-info";
import { setObsScene, setObsStreaming } from "./obs-control";

export const agentActionInput = z.discriminatedUnion("action", [
	z
		.object({
			action: z.literal("channel-update"),
			title: z.string().trim().min(1).max(140).optional(),
			twitchCategoryId: z.string().min(1).optional(),
			kickCategoryId: z.number().int().positive().optional(),
		})
		.refine(
			(value) =>
				value.title !== undefined ||
				value.twitchCategoryId !== undefined ||
				value.kickCategoryId !== undefined,
		),
	z.object({
		action: z.literal("obs-scene"),
		scene: z.string().trim().min(1).max(512),
	}),
	z.object({ action: z.literal("obs-start") }),
	z.object({ action: z.literal("obs-stop") }),
]);

export type AgentActionInput = z.infer<typeof agentActionInput>;

export function agentActionCapability(input: AgentActionInput) {
	switch (input.action) {
		case "channel-update":
			return "channel:update";
		case "obs-scene":
			return "obs:scene:set";
		case "obs-start":
			return "obs:stream:start";
		case "obs-stop":
			return "obs:stream:stop";
	}
}

export async function executeAgentAction(
	userId: string,
	input: AgentActionInput,
) {
	switch (input.action) {
		case "channel-update":
			return updateStreamInfo(userId, input);
		case "obs-scene": {
			const result = await setObsScene(userId, input.scene);
			if (!result) throw new Error("OBS scene is no longer available");
			return result;
		}
		case "obs-start":
			return setObsStreaming(userId, true);
		case "obs-stop":
			return setObsStreaming(userId, false);
	}
}
