import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	BRB_IMAGE_TYPES,
	BRB_SOURCES,
	clearBrbImage,
	confirmBrbHighlightUpload,
	deleteBrbHighlight,
	getBrbHighlightUploadUrl,
	getBrbImageUploadUrl,
	getBrbSettings,
	MAX_BRB_MESSAGE_LENGTH,
	reorderBrbHighlights,
	setBrbHighlightPrefs,
	setBrbSettings,
	stopBrb,
	updateBrbHighlight,
} from "../brb";
import { router } from "../index";
import { listSnapshots } from "../snapshots";
import { relayProcedure } from "./relay";

export const brbRouter = router({
	get: relayProcedure.query(async ({ ctx }) => {
		const settings = await getBrbSettings(ctx.relayUser.id);
		// The snapshot background has no object of its own: it reuses whatever
		// the relay last grabbed, so the preview is the snapshot list itself.
		const snapshots =
			settings.source === "snapshot"
				? await listSnapshots(ctx.relayUser.id, undefined, { liveOnly: false })
				: [];
		return {
			...settings,
			snapshots: snapshots.filter((snapshot) => snapshot.url),
		};
	}),
	update: relayProcedure
		.input(
			z.object({
				enabled: z.boolean(),
				message: z.string().trim().max(MAX_BRB_MESSAGE_LENGTH),
				source: z.enum(BRB_SOURCES),
			}),
		)
		.mutation(({ ctx, input }) => setBrbSettings(ctx.relayUser.id, input)),
	imageUploadUrl: relayProcedure
		.input(
			z.object({
				contentType: z.enum(
					Object.keys(BRB_IMAGE_TYPES) as [keyof typeof BRB_IMAGE_TYPES],
				),
			}),
		)
		.mutation(({ ctx, input }) =>
			getBrbImageUploadUrl(ctx.relayUser.id, input.contentType),
		),
	clearImage: relayProcedure.mutation(({ ctx }) =>
		clearBrbImage(ctx.relayUser.id),
	),
	highlightUploadUrl: relayProcedure.mutation(({ ctx }) =>
		getBrbHighlightUploadUrl(ctx.relayUser.id),
	),
	confirmHighlight: relayProcedure
		.input(
			z.object({
				id: z.uuid(),
				uploadId: z.uuid(),
				filename: z.string().optional(),
				label: z.string().optional(),
			}),
		)
		.mutation(({ ctx, input }) =>
			confirmBrbHighlightUpload(ctx.relayUser.id, input),
		),
	updateHighlight: relayProcedure
		.input(
			z.object({
				id: z.uuid(),
				label: z.string().trim().min(1).max(80).optional(),
				enabled: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input: { id, ...input } }) => {
			const clip = await updateBrbHighlight(ctx.relayUser.id, id, input);
			if (!clip) throw new TRPCError({ code: "NOT_FOUND" });
			return clip;
		}),
	reorderHighlights: relayProcedure
		.input(z.object({ ids: z.array(z.uuid()).max(5) }))
		.mutation(({ ctx, input }) =>
			reorderBrbHighlights(ctx.relayUser.id, input.ids),
		),
	deleteHighlight: relayProcedure
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			if (!(await deleteBrbHighlight(ctx.relayUser.id, input.id)))
				throw new TRPCError({ code: "NOT_FOUND" });
			return { id: input.id };
		}),
	updateHighlightPrefs: relayProcedure
		.input(
			z
				.object({
					muted: z.boolean().optional(),
					overlay: z.boolean().optional(),
				})
				.refine(
					(input) => input.muted !== undefined || input.overlay !== undefined,
				),
		)
		.mutation(({ ctx, input }) =>
			setBrbHighlightPrefs(ctx.relayUser.id, input),
		),
	stop: relayProcedure
		.input(z.object({ pathId: z.number().int().positive() }))
		.mutation(async ({ ctx, input }) => {
			if (!(await stopBrb(ctx.relayUser.id, input.pathId))) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Publishing device not found",
				});
			}
			return { pathId: input.pathId };
		}),
});
