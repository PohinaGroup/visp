import { db } from "@VISP/db";
import {
	appUser,
	chatBot,
	type chatBotSenderModes,
} from "@VISP/db/schema/index";
import { eq } from "drizzle-orm";

export type BotSenderMode = (typeof chatBotSenderModes)[number];

export function resolveBotSenderMode(
	mode: BotSenderMode | undefined,
	canSelectSender: boolean,
): BotSenderMode {
	return mode === "self" && canSelectSender ? "self" : "visp";
}

export class BotSenderSelectionError extends Error {}

export function assertBotSenderModeAllowed(
	mode: BotSenderMode,
	canSelectSender: boolean,
) {
	if (mode === "self" && !canSelectSender) {
		throw new BotSenderSelectionError();
	}
}

export async function canSelectBotSender(userId: string) {
	const owner = await db.query.appUser.findFirst({
		columns: { chatBotAccountSelection: true },
		where: eq(appUser.id, userId),
	});
	return owner?.chatBotAccountSelection ?? false;
}

export async function getEffectiveBotSenderMode(userId: string) {
	const [settings, canSelectSender] = await Promise.all([
		db.query.chatBot.findFirst({
			columns: { senderMode: true },
			where: eq(chatBot.userId, userId),
		}),
		canSelectBotSender(userId),
	]);
	return resolveBotSenderMode(settings?.senderMode, canSelectSender);
}
