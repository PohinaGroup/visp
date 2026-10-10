import { isolationUsage } from "@VISP/api/audio-isolation";
import { subscribeInvalidations } from "@VISP/api/cache-bus";
import { startChatBots } from "@VISP/api/chat/bot";
import { startChatFanout } from "@VISP/api/chat/hub";
import { reconcileKickSubscriptions } from "@VISP/api/chat/kick";
import { flushHostedUsageOnShutdown } from "@VISP/api/hosted-usage";
import { startMultiChatSources } from "@VISP/api/multichat/connectors";
import { applyInvalidation } from "@VISP/api/relay";
import { ensureDefaultRelay } from "@VISP/api/relays";
import { deleteExpiredTypographyProjects } from "@VISP/api/typography";
import { env } from "@VISP/env/server";
import { app } from "./app";
import { startReconciler } from "./machine";

// Bind first so deploy smoke checks do not wait on DB bootstrap work.
app.listen({ hostname: env.SERVER_HOST, port: env.PORT }, () => {
	console.log(`Server is running on http://${env.SERVER_HOST}:${env.PORT}`);
});

try {
	await ensureDefaultRelay();
} catch (error) {
	console.error("Failed to ensure default relay", error);
}

// Registered first so open audio meters hand over their last seconds before
// the shutdown flush below writes the buffer (signal listeners run in order).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.once(signal, () => isolationUsage.endAll());
}
flushHostedUsageOnShutdown();
startReconciler();
subscribeInvalidations(applyInvalidation);
startChatFanout();
startMultiChatSources();
startChatBots();
const cleanupTypography = async () => {
	try {
		await deleteExpiredTypographyProjects();
	} catch (error) {
		console.error("Typography cleanup failed", error);
	}
};
void cleanupTypography();
setInterval(() => void cleanupTypography(), 60 * 60_000);
const reconcileKick = async () => {
	try {
		if (!(await reconcileKickSubscriptions())) {
			setTimeout(() => void reconcileKick(), 10_000);
		}
	} catch (error) {
		console.error("Kick chat subscription reconciliation failed", error);
		setTimeout(() => void reconcileKick(), 10_000);
	}
};
void reconcileKick();
