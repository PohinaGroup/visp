import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "../index";
import { fixedWindow, RateLimitedError } from "../rate-limit";

// Each of these mutations can create or delete provider subscriptions on
// shared VISP credentials (the Kick app token, the Twitch bot, the paid TikTok
// sign API), so one account looping them would hurt everyone. Per-instance,
// like the relay limiter.
const connectionChanges = fixedWindow(10, 60_000);

export function resetConnectionChangeLimitForTests() {
	connectionChanges.reset();
}

/** `protectedProcedure` with a shared per-user budget for chat source changes. */
export const connectionChangeProcedure = protectedProcedure.use(
	({ ctx, next }) => {
		const userId = ctx.session.user.id;
		if (!connectionChanges.take(userId)) {
			const retryAfterMs = connectionChanges.retryAfterMs(userId);
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: `Too many chat connection changes; try again in ${Math.ceil(retryAfterMs / 1_000)} seconds`,
				cause: new RateLimitedError(retryAfterMs),
			});
		}
		return next();
	},
);
