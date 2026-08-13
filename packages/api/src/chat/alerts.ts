import { db } from "@VISP/db";
import {
	chatBotAlert,
	pathState,
	relayPath,
	relayStreamSession,
} from "@VISP/db/schema/index";
import { desc, eq, sql } from "drizzle-orm";
import { type AlertEvent, DEFAULT_ALERT_MESSAGES, getBotSettings } from "./bot";
import { formatDuration, renderTemplate } from "./commands";
import type { ChatProvider } from "./contract";
import { sendableProviders, sendChatMessage } from "./send";

/**
 * How long the same event stays claimed for one device.
 *
 * The not-ready hook and the 10s reconciler both report the same transition, so
 * something has to be the single claim across app instances. A flapping link
 * that drops twice inside this window also only says so once, which is the
 * behaviour chat wants anyway.
 */
const ALERT_COOLDOWN_SECONDS = 60;

/**
 * The cross-instance claim. A returned row is permission to send: the upsert
 * only touches the row when the last send is older than the cooldown, so two
 * instances racing the same transition produce exactly one message.
 */
async function claimAlert(pathId: number, event: AlertEvent, cooldown: number) {
	const [claimed] = await db
		.insert(chatBotAlert)
		.values({ pathId, event })
		.onConflictDoUpdate({
			target: [chatBotAlert.pathId, chatBotAlert.event],
			set: { sentAt: sql`now()` },
			setWhere: sql`${chatBotAlert.sentAt} < now() - ${sql.raw(`interval '${cooldown} seconds'`)}`,
		})
		.returning({ pathId: chatBotAlert.pathId });
	return Boolean(claimed);
}

async function alertContext(pathId: number) {
	const [row] = await db
		.select({
			userId: relayPath.userId,
			label: relayPath.label,
			brbSince: pathState.brbSince,
		})
		.from(relayPath)
		.leftJoin(pathState, eq(pathState.pathId, relayPath.id))
		.where(eq(relayPath.id, pathId))
		.limit(1);
	if (!row) return null;
	const [session] = await db
		.select({
			startedAt: relayStreamSession.startedAt,
			endedAt: relayStreamSession.endedAt,
		})
		.from(relayStreamSession)
		.where(eq(relayStreamSession.pathId, pathId))
		.orderBy(desc(relayStreamSession.startedAt))
		.limit(1);
	return { ...row, session };
}

/**
 * Tell chat what just happened to the stream. Fire-and-forget by contract:
 * a chat outage must never fail a path hook.
 */
export async function announceStreamEvent(
	pathId: number,
	event: AlertEvent,
	vars: Record<string, string> = {},
	now = Date.now(),
): Promise<void> {
	try {
		const context = await alertContext(pathId);
		if (!context) return;
		const settings = await getBotSettings(context.userId);
		if (!settings.enabled || !settings.alerts[event]) return;
		if (!(await claimAlert(pathId, event, ALERT_COOLDOWN_SECONDS))) return;

		const started = context.session?.startedAt?.getTime();
		const ended = context.session?.endedAt?.getTime() ?? now;
		const text = renderTemplate(
			settings.messages[event] ?? DEFAULT_ALERT_MESSAGES[event],
			{
				device: context.label,
				uptime: started ? formatDuration(ended - started) : undefined,
				downtime: context.brbSince
					? formatDuration(now - context.brbSince.getTime())
					: undefined,
				...vars,
			},
		);

		const allowed = await sendableProviders(context.userId);
		const targets = allowed.filter(
			(provider: ChatProvider) => settings.targets[provider],
		);
		await Promise.all(
			targets.map((provider) =>
				sendChatMessage(context.userId, provider, text),
			),
		);
	} catch (error) {
		console.error("Chat alert failed", error);
	}
}
