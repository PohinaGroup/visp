import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	BRB_IMAGE_TYPES,
	BRB_SOURCES,
	clearBrbImage,
	getBrbImageUploadUrl,
	getBrbSettings,
	MAX_BRB_MESSAGE_LENGTH,
	setBrbSettings,
	stopBrb,
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
	stop: relayProcedure
		.input(z.object({ pathId: z.number().int().positive() }))
		.mutation(async ({ ctx, input }) => {
			if (!(await stopBrb(ctx.relayUser.id, input.pathId))) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "This device is not showing a BRB card",
				});
			}
			return { pathId: input.pathId };
		}),
});
