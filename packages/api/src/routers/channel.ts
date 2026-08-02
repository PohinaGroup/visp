import { z } from "zod";
import {
	getViewerCounts,
	searchStreamCategories,
	updateStreamInfo,
} from "../channel/stream-info";
import { protectedProcedure, router } from "../index";

export const channelRouter = router({
	viewerCounts: protectedProcedure
		.input(
			z.object({
				providers: z
					.array(z.enum(["twitch", "kick", "youtube"]))
					.min(1)
					.max(3),
			}),
		)
		.query(({ ctx, input }) =>
			getViewerCounts(ctx.session.user.id, [...new Set(input.providers)]),
		),
	searchCategories: protectedProcedure
		.input(z.object({ query: z.string().trim().min(2).max(100) }))
		.query(({ ctx, input }) =>
			searchStreamCategories(ctx.session.user.id, input.query),
		),
	update: protectedProcedure
		.input(
			z
				.object({
					title: z.string().trim().min(1).max(140).optional(),
					twitchCategoryId: z.string().min(1).optional(),
					kickCategoryId: z.number().int().positive().optional(),
				})
				.refine(
					(value) =>
						value.title !== undefined ||
						value.twitchCategoryId !== undefined ||
						value.kickCategoryId !== undefined,
					{ message: "Nothing to update" },
				),
		)
		.mutation(({ ctx, input }) => updateStreamInfo(ctx.session.user.id, input)),
});
