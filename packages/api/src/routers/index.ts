import { protectedProcedure, publicProcedure, router } from "../index";
import { adminRouter } from "./admin";
import { brbRouter } from "./brb";
import { channelRouter } from "./channel";
import { chatRouter } from "./chat";
import { relayRoutes } from "./relay";

export const appRouter = router({
	admin: adminRouter,
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	chat: chatRouter,
	channel: channelRouter,
	brb: brbRouter,
	...relayRoutes,
});
export type AppRouter = typeof appRouter;
