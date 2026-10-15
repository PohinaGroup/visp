import { polarConfigured } from "@VISP/auth/polar";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { recordHostedUsage } from "../hosted-usage";
import { protectedProcedure, router } from "../index";
import {
	entitlementFrom,
	isEntitled,
	monthUsage,
	nextMonthStart,
	PLAN_FEATURES,
	PLUS_QUOTAS,
	planOwner,
} from "../plan";
import { fixedWindow } from "../rate-limit";
import { SUBTITLES_PROVIDER, SUBTITLES_REPORT_MAX_SECONDS } from "../subtitles";

/** One report a minute is expected; two leaves room for a reconnect. */
const subtitleReports = fixedWindow(2, 60_000);

export const planRouter = router({
	/** Plan, status and this month's quota per feature, for every client. */
	me: protectedProcedure.query(async ({ ctx }) => {
		const userId = ctx.session.user.id;
		const now = new Date();
		const [owner, used] = await Promise.all([
			planOwner(userId),
			monthUsage(userId, now),
		]);
		const plan = owner?.plan === "plus" ? ("plus" as const) : ("free" as const);
		const comped = owner?.comped ?? false;
		const billing = polarConfigured();
		return {
			plan,
			comped,
			/** Web only: POST /api/auth/checkout {slug: "plus"}. Never for comps. */
			canCheckout: billing && plan === "free" && !comped,
			/** Web only: /api/auth/customer/portal (card, cancel, invoices). */
			canManage: billing && plan === "plus",
			status: owner?.planStatus ?? null,
			periodEnd: owner?.planPeriodEnd?.toISOString() ?? null,
			resetsAt: nextMonthStart(now).toISOString(),
			features: PLAN_FEATURES.map((feature) => {
				const access = entitlementFrom(owner, feature, used);
				const quota =
					feature in PLUS_QUOTAS
						? PLUS_QUOTAS[feature as keyof typeof PLUS_QUOTAS]
						: null;
				return { feature, ...access, quota };
			}),
		};
	}),
	/**
	 * Caption audio goes from the app to ElevenLabs directly, so the app reports
	 * each minute after the first (the token mint charged that one). Recorded
	 * while entitled even at quota zero: a running session is never cut off.
	 */
	reportSubtitles: protectedProcedure
		.input(
			z.object({
				seconds: z.number().int().min(1).max(SUBTITLES_REPORT_MAX_SECONDS),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;
			if (!subtitleReports.take(userId)) {
				throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
			}
			const owner = await planOwner(userId);
			if (!owner || !isEntitled(owner, "subtitles")) return { ok: false };
			recordHostedUsage({
				userId,
				feature: "subtitles",
				units: input.seconds,
				unit: "seconds",
				provider: SUBTITLES_PROVIDER,
			});
			return { ok: true };
		}),
});
