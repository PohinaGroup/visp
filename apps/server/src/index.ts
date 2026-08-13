import { subscribeInvalidations } from "@VISP/api/cache-bus";
import { startChatBots } from "@VISP/api/chat/bot";
import { startChatFanout } from "@VISP/api/chat/hub";
import { reconcileKickSubscriptions } from "@VISP/api/chat/kick";
import { applyInvalidation } from "@VISP/api/relay";
import { ensureDefaultRelay } from "@VISP/api/relays";
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

startReconciler();
subscribeInvalidations(applyInvalidation);
startChatFanout();
startChatBots();
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
