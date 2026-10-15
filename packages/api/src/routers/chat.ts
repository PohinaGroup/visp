import { chatBotSenderModes } from "@VISP/db/schema/index";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	BotCommandLimitError,
	DEFAULT_ALERT_MESSAGES,
	deleteBotCommand,
	getBotSettingsAccess,
	listBotCommands,
	MAX_ALERT_MESSAGE_LENGTH,
	setBotSettings,
	upsertBotCommand,
} from "../chat/bot";
import {
	COMMAND_NAME_PATTERN,
	MAX_COMMAND_RESPONSE_LENGTH,
} from "../chat/commands";
import { connectionChangeProcedure } from "../chat/connection-limit";
import {
	ChatConnectionError,
	disableChatConnection,
	enableChatConnection,
	listChatConnections,
} from "../chat/connections";
import { moderatorStatus } from "../chat/moderator";
import {
	chatOverlayTokenStatus,
	issueChatOverlayToken,
	revokeChatOverlayToken,
} from "../chat/overlay-token";
import { sendableProviders, sendChatMessage } from "../chat/send";
import { BotSenderSelectionError } from "../chat/sender";
import { chatTickets } from "../chat/tickets";
import { protectedProcedure, router } from "../index";
import { speechAvailability } from "../plan";
import { relayProcedure } from "./relay";

const provider = z.enum(["twitch", "kick", "youtube"]);

const alertMessage = z.string().trim().max(MAX_ALERT_MESSAGE_LENGTH).nullable();
const perEvent = <T extends z.ZodTypeAny>(value: T) =>
	z.object({ live: value, brb: value, back: value, offline: value });

const botSettings = z.object({
	enabled: z.boolean(),
	commandsEnabled: z.boolean(),
	prefix: z.string().trim().min(1).max(3),
	senderMode: z.enum(chatBotSenderModes),
	targets: z.object({
		twitch: z.boolean(),
		kick: z.boolean(),
		youtube: z.boolean(),
	}),
	alerts: perEvent(z.boolean()),
	messages: perEvent(alertMessage),
	moderator: z.object({
		enabled: z.boolean(),
		rules: z.string().trim().max(2000),
		// Twitch caps a timeout at two weeks.
		maxTimeoutSeconds: z.number().int().min(1).max(1_209_600),
		onRaid: z.boolean(),
		onGift: z.boolean(),
		onSignal: z.boolean(),
		onQuestions: z.boolean(),
	}),
});

export const chatRouter = router({
	connections: router({
		list: protectedProcedure.query(({ ctx }) =>
			listChatConnections(ctx.session.user.id),
		),
		enable: connectionChangeProcedure
			.input(z.object({ provider }))
			.mutation(async ({ ctx, input }) => {
				try {
					return await enableChatConnection(
						ctx.session.user.id,
						input.provider,
					);
				} catch (error) {
					if (error instanceof ChatConnectionError) {
						throw new TRPCError({
							code:
								error.code === "not-linked"
									? "BAD_REQUEST"
									: "PRECONDITION_FAILED",
							message: error.message,
							cause: error,
						});
					}
					throw error;
				}
			}),
		disable: connectionChangeProcedure
			.input(z.object({ provider }))
			.mutation(({ ctx, input }) =>
				disableChatConnection(ctx.session.user.id, input.provider),
			),
	}),
	liveTicket: protectedProcedure.mutation(({ ctx }) =>
		chatTickets.issue(ctx.session.user.id),
	),
	/** The revocable URL credential for the OBS browser-source overlay. */
	overlay: router({
		status: relayProcedure.query(({ ctx }) =>
			chatOverlayTokenStatus(ctx.relayUser.id),
		),
		issue: relayProcedure.mutation(({ ctx }) =>
			issueChatOverlayToken(ctx.relayUser.id),
		),
		revoke: relayProcedure.mutation(({ ctx }) =>
			revokeChatOverlayToken(ctx.relayUser.id),
		),
	}),
	/** What the read-aloud, isolation, and caption settings may offer. */
	speech: protectedProcedure.query(({ ctx }) =>
		speechAvailability(ctx.session.user.id),
	),
	/** Alerts, commands, and where the bot is allowed to post. */
	bot: router({
		get: relayProcedure.query(async ({ ctx }) => {
			const [access, commands, canPost, moderator] = await Promise.all([
				getBotSettingsAccess(ctx.relayUser.id),
				listBotCommands(ctx.relayUser.id),
				sendableProviders(ctx.relayUser.id),
				moderatorStatus(ctx.relayUser.id),
			]);
			return {
				settings: access.settings,
				canSelectSender: access.canSelectSender,
				commands,
				canPost,
				moderator,
				defaultMessages: DEFAULT_ALERT_MESSAGES,
				maxMessageLength: MAX_ALERT_MESSAGE_LENGTH,
			};
		}),
		update: relayProcedure
			.input(botSettings)
			.mutation(async ({ ctx, input }) => {
				try {
					return await setBotSettings(ctx.relayUser.id, input);
				} catch (error) {
					if (error instanceof BotSenderSelectionError) {
						throw new TRPCError({
							code: "FORBIDDEN",
							message: "Your account cannot select a different chat sender",
						});
					}
					throw error;
				}
			}),
		upsertCommand: relayProcedure
			.input(
				z.object({
					name: z
						.string()
						.trim()
						.toLowerCase()
						.regex(COMMAND_NAME_PATTERN, "Letters, numbers, - and _ only"),
					response: z.string().trim().min(1).max(MAX_COMMAND_RESPONSE_LENGTH),
					modOnly: z.boolean().default(false),
					enabled: z.boolean().optional(),
					cooldownSeconds: z.number().int().min(0).max(3600).default(10),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					return await upsertBotCommand(ctx.relayUser.id, input);
				} catch (error) {
					if (error instanceof BotCommandLimitError) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `${error.message}; delete one first`,
							cause: error,
						});
					}
					throw error;
				}
			}),
		deleteCommand: relayProcedure
			.input(z.object({ name: z.string().trim().toLowerCase() }))
			.mutation(async ({ ctx, input }) => {
				if (!(await deleteBotCommand(ctx.relayUser.id, input.name))) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Command not found",
					});
				}
				return { name: input.name };
			}),
		/** Proves consent and delivery in one click, which is most of support. */
		test: relayProcedure
			.input(z.object({ provider }))
			.mutation(async ({ ctx, input }) => {
				const result = await sendChatMessage(
					ctx.relayUser.id,
					input.provider,
					"VISP chat bot is connected.",
				);
				if (result === "unauthorized") {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: `Allow VISP to post in ${input.provider} chat first`,
					});
				}
				if (result !== "sent") {
					throw new TRPCError({
						code: "SERVICE_UNAVAILABLE",
						message:
							result === "throttled"
								? "Too many messages just now, try again shortly"
								: "That platform did not accept the message",
					});
				}
				return { provider: input.provider };
			}),
	}),
});
