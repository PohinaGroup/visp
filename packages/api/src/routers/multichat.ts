import { z } from "zod";
import { protectedProcedure, router } from "../index";
import {
	MULTICHAT_PROVIDERS,
	type MultiChatProvider,
} from "../multichat/contract";
import {
	issueMultiChatOverlayToken,
	revokeMultiChatOverlayToken,
} from "../multichat/overlay-token";
import {
	getMultiChatSettings,
	saveMultiChatSources,
} from "../multichat/sources";

const provider = z.enum(MULTICHAT_PROVIDERS);
const source = z.object({
	provider,
	enabled: z.boolean(),
	channelLogin: z.string().max(80),
});

export const multiChatRouter = router({
	get: protectedProcedure.query(({ ctx }) =>
		getMultiChatSettings(ctx.session.user.id),
	),
	save: protectedProcedure
		.input(z.array(source).min(1).max(MULTICHAT_PROVIDERS.length))
		.mutation(({ ctx, input }) => {
			const providers = new Set(input.map((entry) => entry.provider));
			if (providers.size !== input.length)
				throw new Error("Each platform may appear once");
			return saveMultiChatSources(
				ctx.session.user.id,
				input as Array<{
					provider: MultiChatProvider;
					enabled: boolean;
					channelLogin: string;
				}>,
			);
		}),
	overlay: router({
		issue: protectedProcedure.mutation(({ ctx }) =>
			issueMultiChatOverlayToken(ctx.session.user.id),
		),
		revoke: protectedProcedure.mutation(({ ctx }) =>
			revokeMultiChatOverlayToken(ctx.session.user.id),
		),
	}),
});
