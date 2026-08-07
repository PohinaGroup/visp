import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { betterFeatures } from "../better-features";
import {
	ChatConnectionError,
	disableChatConnection,
	enableChatConnection,
	listChatConnections,
} from "../chat/connections";
import {
	chatOverlayTokenStatus,
	issueChatOverlayToken,
	revokeChatOverlayToken,
} from "../chat/overlay-token";
import { chatTickets } from "../chat/tickets";
import { protectedProcedure, router } from "../index";
import { relayProcedure } from "./relay";

const provider = z.enum(["twitch", "kick", "youtube"]);

export const chatRouter = router({
	connections: router({
		list: protectedProcedure.query(({ ctx }) =>
			listChatConnections(ctx.session.user.id),
		),
		enable: protectedProcedure
			.input(z.object({ provider }))
			.mutation(async ({ ctx, input }) => {
				try {
					return await enableChatConnection(
						ctx.session.user.id,
						input.provider,
					);
				} catch (error) {
					if (error instanceof ChatConnectionError) {
						throw new TRPCError({
							code:
								error.code === "not-linked"
									? "BAD_REQUEST"
									: "PRECONDITION_FAILED",
							message: error.message,
							cause: error,
						});
					}
					throw error;
				}
			}),
		disable: protectedProcedure
			.input(z.object({ provider }))
			.mutation(({ ctx, input }) =>
				disableChatConnection(ctx.session.user.id, input.provider),
			),
	}),
	liveTicket: protectedProcedure.mutation(({ ctx }) =>
		chatTickets.issue(ctx.session.user.id),
	),
	/** The revocable URL credential for the OBS browser-source overlay. */
	overlay: router({
		status: relayProcedure.query(({ ctx }) =>
			chatOverlayTokenStatus(ctx.relayUser.id),
		),
		issue: relayProcedure.mutation(({ ctx }) =>
			issueChatOverlayToken(ctx.relayUser.id),
		),
		revoke: relayProcedure.mutation(({ ctx }) =>
			revokeChatOverlayToken(ctx.relayUser.id),
		),
	}),
	/** What the read-aloud, isolation, and caption settings may offer. */
	speech: protectedProcedure.query(({ ctx }) =>
		betterFeatures(ctx.session.user.id),
	),
});
