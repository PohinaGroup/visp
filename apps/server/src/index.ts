import { isolationUsage } from "@VISP/api/audio-isolation";
import { PLAN_SYNC_INTERVAL_MS, syncPlans } from "@VISP/api/billing";
import { subscribeInvalidations } from "@VISP/api/cache-bus";
import { startChatBots } from "@VISP/api/chat/bot";
import { startChatFanout } from "@VISP/api/chat/hub";
import { reconcileKickSubscriptions } from "@VISP/api/chat/kick";
import {
	DAILY_METRICS_CHECK_INTERVAL_MS,
	isDailyMetricsDue,
	runDailyMetricsJob,
} from "@VISP/api/daily-metrics";
import { flushHostedUsageOnShutdown } from "@VISP/api/hosted-usage";
import { startMultiChatSources } from "@VISP/api/multichat/connectors";
import { applyInvalidation } from "@VISP/api/relay";
import { rollupAndPruneRelayHealth } from "@VISP/api/relay-health-retention";
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
// Every instance runs this; the advisory lock inside lets only one roll up.
const retainRelayHealth = async () => {
	try {
		await rollupAndPruneRelayHealth();
	} catch (error) {
		console.error("Relay health rollup failed", error);
	}
};
void retainRelayHealth();
setInterval(() => void retainRelayHealth(), 60 * 60_000);
// Nightly rollup after 03:00 UTC, plus once at startup when yesterday is
// missing (deploys and restarts). Every instance checks every 15 minutes
// whether the night's run is still due (decided from the stored rows, so a
// drifting timer, downtime over 03:00 or a failed run cannot skip a night,
// and a restart does not repeat it); the advisory lock inside the job lets
// only one instance roll up at a time.
let dailyMetricsRunning = false;
const rollupDailyMetricsNightly = async (startup: boolean) => {
	if (dailyMetricsRunning) return;
	dailyMetricsRunning = true;
	const now = new Date();
	try {
		if (!(await isDailyMetricsDue(now, { startup }))) return;
		await runDailyMetricsJob(now);
	} catch (error) {
		console.error("Daily metrics rollup failed", error);
	} finally {
		dailyMetricsRunning = false;
	}
};
void rollupDailyMetricsNightly(true);
// Catches a missed Polar webhook; idempotent, and only one instance runs it.
const syncStalePlans = () =>
	void syncPlans().catch((error) => console.error("Plan sync failed", error));
syncStalePlans();
setInterval(syncStalePlans, PLAN_SYNC_INTERVAL_MS);
setInterval(
	() => void rollupDailyMetricsNightly(false),
	DAILY_METRICS_CHECK_INTERVAL_MS,
);
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
