import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../index";
import { getStudioPreviewUrls } from "../relay";
import {
	createStudioAssetUpload,
	finalizeStudioAsset,
	getStudioAssetUrl,
	getStudioGraph,
	getStudioSettings,
	saveStudioGraph,
	setEmptyStudioWarning,
	setStudioMode,
	studioGraphSchema,
} from "../studio";
import { relayProcedure } from "./relay";

function studioError(error: unknown): never {
	throw new TRPCError({
		code:
			error instanceof Error && error.message.includes("not found")
				? "NOT_FOUND"
				: "BAD_REQUEST",
		message: error instanceof Error ? error.message : "Studio change failed",
		cause: error,
	});
}

export const studioRouter = router({
	get: relayProcedure.query(async ({ ctx }) => ({
		graph: await getStudioGraph(ctx.relayUser.id),
		preview: await getStudioPreviewUrls(ctx.relayUser.id),
		settings: await getStudioSettings(ctx.relayUser.id),
	})),
	save: relayProcedure
		.input(studioGraphSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await saveStudioGraph(ctx.relayUser.id, input);
			} catch (error) {
				studioError(error);
			}
		}),
	mode: router({
		get: relayProcedure.query(({ ctx }) => getStudioSettings(ctx.relayUser.id)),
		set: relayProcedure
			.input(z.object({ mode: z.enum(["cloud_studio", "obs"]) }))
			.mutation(async ({ ctx, input }) => {
				try {
					return await setStudioMode(ctx.relayUser.id, input.mode);
				} catch (error) {
					studioError(error);
				}
			}),
	}),
	emptyWarning: relayProcedure
		.input(z.object({ dismissed: z.boolean() }))
		.mutation(({ ctx, input }) =>
			setEmptyStudioWarning(ctx.relayUser.id, input.dismissed),
		),
	assetUploadUrl: relayProcedure
		.input(z.object({ assetId: z.uuid(), contentType: z.literal("image/png") }))
		.mutation(({ ctx, input }) =>
			createStudioAssetUpload(ctx.relayUser.id, input.assetId),
		),
	assetFinalize: relayProcedure
		.input(z.object({ assetId: z.uuid() }))
		.mutation(({ ctx, input }) =>
			finalizeStudioAsset(ctx.relayUser.id, input.assetId),
		),
	assetUrl: relayProcedure
		.input(z.object({ assetId: z.uuid() }))
		.query(async ({ ctx, input }) => {
			const url = await getStudioAssetUrl(ctx.relayUser.id, input.assetId);
			if (!url)
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Studio asset not found",
				});
			return { url };
		}),
});
