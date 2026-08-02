import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { betterFeatures } from "../better-features";
import {
	ChatConnectionError,
	disableChatConnection,
	enableChatConnection,
	listChatConnections,
} from "../chat/connections";
import { chatTickets } from "../chat/tickets";
import { protectedProcedure, router } from "../index";

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
	/** What the read-aloud, isolation, and caption settings may offer. */
	speech: protectedProcedure.query(({ ctx }) =>
		betterFeatures(ctx.session.user.id),
	),
});
