import { db } from "@VISP/db";
import { affiliateApplication } from "@VISP/db/schema/index";
import { env } from "@VISP/env/server";
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

// Discord reads `content`, Slack reads `text`; each ignores the other's key, so
// one payload works with either webhook URL.
export async function notifyApplication(
	input: z.infer<typeof affiliateApplicationInput>,
	url = env.APPLICATION_WEBHOOK_URL,
) {
	if (!url) return;
	const body = [
		"**Founding creator application**",
		`${input.applicantName} — ${input.email}`,
		input.youtubeChannelUrl,
		input.relevantVideoUrl,
		input.audienceAndSetup.slice(0, 1500),
	].join("\n");
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ content: body, text: body }),
		});
		if (!response.ok) {
			console.error(`Application webhook returned ${response.status}`);
		}
	} catch (error) {
		console.error(error);
	}
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

			// The application is already stored; a webhook outage must not fail the
			// applicant's submit.
			void notifyApplication(input);

			return { ok: true as const };
		}),
});
