import { db } from "@VISP/db";
import { affiliateApplication } from "@VISP/db/schema/index";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { fixedWindow } from "../rate-limit";

const httpUrl = z
	.string()
	.trim()
	.max(2048)
	.url()
	.refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
		message: "Enter an HTTP or HTTPS URL",
	});

export const affiliateApplicationInput = z.object({
	applicantName: z.string().trim().min(1).max(120),
	email: z
		.string()
		.trim()
		.max(320)
		.email()
		.transform((value) => value.toLowerCase()),
	youtubeChannelUrl: httpUrl.refine(
		(value) => {
			const hostname = new URL(value).hostname.toLowerCase();
			return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
		},
		{ message: "Enter a YouTube channel URL" },
	),
	relevantVideoUrl: httpUrl,
	audienceAndSetup: z.string().trim().min(1).max(4000),
	disclosureAccepted: z.literal(true),
	website: z.string().max(200).optional().default(""),
});

// ponytail: per-instance limit is enough for a five-creator pilot; move it to
// Postgres only if multiple app instances make the cap ineffective.
const applicationRequests = fixedWindow(5, 60 * 60_000);

function requesterKey(headers: Headers, email: string) {
	const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || headers.get("x-real-ip") || email;
}

export const affiliateRouter = router({
	submit: publicProcedure
		.input(affiliateApplicationInput)
		.mutation(async ({ ctx, input }) => {
			if (input.website) return { ok: true as const };
			if (!applicationRequests.take(requesterKey(ctx.headers, input.email))) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: "Too many applications; try again later",
				});
			}

			await db.insert(affiliateApplication).values({
				applicantName: input.applicantName,
				email: input.email,
				youtubeChannelUrl: input.youtubeChannelUrl,
				relevantVideoUrl: input.relevantVideoUrl,
				audienceAndSetup: input.audienceAndSetup,
				disclosureAccepted: input.disclosureAccepted,
			});

			return { ok: true as const };
		}),
});
