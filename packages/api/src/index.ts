import { isAdminUser } from "@VISP/auth";
import { initTRPC, TRPCError } from "@trpc/server";

import type { Context } from "./context";
import { RateLimitedError } from "./rate-limit";

export const t = initTRPC.context<Context>().create({
	// Rate-limit errors carry the real remaining wait so the UI can name it.
	errorFormatter({ shape, error }) {
		return error.cause instanceof RateLimitedError
			? {
					...shape,
					data: { ...shape.data, retryAfterMs: error.cause.retryAfterMs },
				}
			: shape;
	},
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
			cause: "No session",
		});
	}
	return next({
		ctx: {
			...ctx,
			session: ctx.session,
		},
	});
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
	if (!isAdminUser(ctx.session.user)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Administrator access required",
		});
	}
	return next();
});
