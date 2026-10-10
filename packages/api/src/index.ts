import { isAdminUser } from "@VISP/auth";
import { isBanActive } from "@VISP/auth/sessions";
import { db } from "@VISP/db";
import { user } from "@VISP/db/schema/index";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

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

// Bans end every session (packages/auth/src/sessions.ts), so this is the
// backstop for a session that outlived one anyway, e.g. a ban written straight
// to the database. It reads the user the session resolved with — current for a
// session served from the session table — and adds no query per request.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
			cause: "No session",
		});
	}
	if (isBanActive(ctx.session.user)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
			cause: "Banned user",
		});
	}
	return next({
		ctx: {
			...ctx,
			session: ctx.session,
		},
	});
});

// The session's user is a cached copy that can be days old, so admin access is
// decided from the user row as it is now.
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
	const [current] = await db
		.select({
			id: user.id,
			role: user.role,
			banned: user.banned,
			banExpires: user.banExpires,
		})
		.from(user)
		.where(eq(user.id, ctx.session.user.id))
		.limit(1);
	if (!current || isBanActive(current) || !isAdminUser(current)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Administrator access required",
		});
	}
	return next();
});
