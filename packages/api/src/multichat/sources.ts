import { db } from "@VISP/db";
import { multiChatSource } from "@VISP/db/schema/index";
import { and, eq } from "drizzle-orm";
import { MULTICHAT_PROVIDERS, type MultiChatProvider } from "./contract";
import { multiChatHub } from "./hub";
import { multiChatOverlayTokenStatus } from "./overlay-token";

export const multiChatProviders = MULTICHAT_PROVIDERS;

export function normalizeChannelLogin(value: string) {
	const login = value.trim().replace(/^@/, "").toLowerCase();
	if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(login)) {
		throw new Error("Use 1–64 letters, numbers, dots, dashes, or underscores");
	}
	return login;
}

export async function getMultiChatSettings(userId: string) {
	const [sources, overlay] = await Promise.all([
		db.select().from(multiChatSource).where(eq(multiChatSource.userId, userId)),
		multiChatOverlayTokenStatus(userId),
	]);
	return {
		overlay,
		sources: multiChatProviders.map((provider) => {
			const source = sources.find((entry) => entry.provider === provider);
			return {
				provider,
				enabled: source?.enabled ?? false,
				channelLogin: source?.channelLogin ?? "",
			};
		}),
	};
}

export async function saveMultiChatSources(
	userId: string,
	sources: Array<{
		provider: MultiChatProvider;
		enabled: boolean;
		channelLogin: string;
	}>,
) {
	for (const source of sources) {
		if (!source.channelLogin.trim()) {
			if (source.enabled) throw new Error("Enter a channel nickname first");
			await db
				.delete(multiChatSource)
				.where(
					and(
						eq(multiChatSource.userId, userId),
						eq(multiChatSource.provider, source.provider),
					),
				);
			continue;
		}
		const channelLogin = normalizeChannelLogin(source.channelLogin);
		const current = await db.query.multiChatSource.findFirst({
			where: and(
				eq(multiChatSource.userId, userId),
				eq(multiChatSource.provider, source.provider),
			),
		});
		const changed = current?.channelLogin !== channelLogin;
		await db
			.insert(multiChatSource)
			.values({
				userId,
				provider: source.provider,
				channelLogin,
				enabled: source.enabled,
			})
			.onConflictDoUpdate({
				target: [multiChatSource.userId, multiChatSource.provider],
				set: {
					channelLogin,
					enabled: source.enabled,
					...(changed && { channelId: null, kickSubscriptionId: null }),
					updatedAt: new Date(),
				},
			});
	}
	multiChatHub.requestRefresh(userId);
	return getMultiChatSettings(userId);
}
