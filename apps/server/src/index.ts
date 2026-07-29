import { subscribeInvalidations } from "@VISP/api/cache-bus";
import { startChatFanout } from "@VISP/api/chat/hub";
import { reconcileKickSubscriptions } from "@VISP/api/chat/kick";
import { applyInvalidation } from "@VISP/api/relay";
import { ensureDefaultRelay } from "@VISP/api/relays";
import { env } from "@VISP/env/server";
import { app } from "./app";
import { startReconciler } from "./machine";

await ensureDefaultRelay();
app.listen({ hostname: env.SERVER_HOST, port: env.PORT }, () => {
	console.log(`Server is running on http://${env.SERVER_HOST}:${env.PORT}`);
});
startReconciler();
subscribeInvalidations(applyInvalidation);
startChatFanout();
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
