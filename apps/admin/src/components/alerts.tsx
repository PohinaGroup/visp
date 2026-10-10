import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib";

export type AdminAlert = Awaited<
	ReturnType<typeof trpc.admin.alerts.list.query>
>[number];

/** Alerts are computed on read, so a minute is as fresh as polling gets useful. */
export const ALERTS_REFETCH_MS = 60_000;

/**
 * `admin.alerts.list`, shared by the Overview panel and the nav badge: one
 * query key, so the two never disagree and only one request is in flight.
 */
export function useAdminAlerts() {
	return useQuery({
		queryKey: ["admin-alerts"],
		queryFn: () => trpc.admin.alerts.list.query(),
		refetchInterval: ALERTS_REFETCH_MS,
	});
}

/**
 * Count of critical alerts for the "Overview" nav item; renders nothing when
 * there are none (warnings wait on the Overview itself) or while loading.
 */
export function CriticalAlertsBadge() {
	const alerts = useAdminAlerts();
	const critical =
		alerts.data?.filter((alert) => alert.severity === "critical").length ?? 0;
	if (critical === 0) return null;
	return (
		<span
			className="ml-auto inline-flex h-5 min-w-5 items-center justify-center bg-destructive px-1.5 font-medium text-[0.7rem] text-white tabular-nums"
			title={`${critical} critical ${critical === 1 ? "alert" : "alerts"}`}
		>
			{critical}
			<span className="sr-only">
				{" "}
				critical {critical === 1 ? "alert" : "alerts"}
			</span>
		</span>
	);
}
