import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { KpiTile } from "@VISP/ui/components/kpi-tile";
import { Skeleton } from "@VISP/ui/components/skeleton";
import { cn } from "@VISP/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import {
	type ApiRange,
	pickDateRangeSearch,
	useDateRange,
} from "../app/date-range";
import { findNavItem } from "../app/nav";
import { trpc } from "../lib";
import { comparisonLabel } from "../lib/overview";
import { formatEur } from "../lib/usage";
import { type AdminAlert, useAdminAlerts } from "./alerts";

/**
 * Placeholders for Overview panels other tasks build. The Overview page
 * already renders each one in its final position with the date range it will
 * need, so filling a slot means editing only this file, never
 * `pages/overview.tsx`. Each renders nothing until then, so the page shows no
 * empty boxes.
 */
export type OverviewSlotProps = {
	/** The dashboard range as `toApiRange(useDateRange())` returns it. */
	range: ApiRange;
};

const SEVERITY_DOT: Record<AdminAlert["severity"], string> = {
	critical: "bg-destructive",
	warning: "bg-amber-500",
};

const SEVERITY_LABEL: Record<AdminAlert["severity"], string> = {
	critical: "Critical",
	warning: "Warning",
};

/** Links into dashboards keep the date range; Tools pages start clean. */
function alertSearch(href: string) {
	return findNavItem(href)?.group === "Dashboards"
		? (prev: Record<string, unknown>) => pickDateRangeSearch(prev)
		: {};
}

function AlertItem({ alert }: { alert: AdminAlert }) {
	return (
		<li className="flex gap-3 py-2.5">
			<span
				aria-hidden
				className={cn(
					"mt-1.5 size-2 shrink-0 rounded-full",
					SEVERITY_DOT[alert.severity],
				)}
			/>
			<div className="min-w-0">
				<Link
					className="font-medium text-sm underline-offset-4 hover:underline"
					search={alertSearch(alert.href)}
					to={alert.href}
				>
					<span className="sr-only">{SEVERITY_LABEL[alert.severity]}: </span>
					{alert.title}
				</Link>
				<p className="text-muted-foreground text-xs">{alert.detail}</p>
			</div>
		</li>
	);
}

/**
 * T23: "Needs attention" from `admin.alerts.list` (relays full, dark or out
 * of disk, capacity running out, Direct sessions failing, spend over
 * budget), critical first. Not tied to the date range: alerts are about now.
 * Polls every minute, sharing its query with the nav badge.
 */
export function OverviewAttention(_props: OverviewSlotProps) {
	const alerts = useAdminAlerts();
	const critical =
		alerts.data?.filter((alert) => alert.severity === "critical").length ?? 0;
	const warnings = (alerts.data?.length ?? 0) - critical;
	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle>
					<h2 className="text-lg">Needs attention</h2>
				</CardTitle>
				<CardDescription>
					{alerts.data?.length
						? [
								critical ? `${critical} critical` : null,
								warnings
									? `${warnings} ${warnings === 1 ? "warning" : "warnings"}`
									: null,
							]
								.filter(Boolean)
								.join(", ")
						: "Relay health and capacity, session success and spend, checked every minute."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{alerts.isPending ? (
					<div className="grid gap-2" aria-busy>
						<Skeleton className="h-9" />
						<Skeleton className="h-9" />
					</div>
				) : alerts.isError ? (
					<div className="flex items-center justify-between gap-3 text-sm">
						<p className="text-destructive">Could not load alerts.</p>
						<Button
							size="sm"
							variant="outline"
							onClick={() => void alerts.refetch()}
						>
							Retry
						</Button>
					</div>
				) : alerts.data.length === 0 ? (
					<p className="flex items-center gap-2 text-muted-foreground text-sm">
						<CircleCheck className="size-4 text-success" />
						All clear
					</p>
				) : (
					<ul className="-my-2.5 divide-y divide-border/60">
						{alerts.data.map((alert) => (
							<AlertItem alert={alert} key={alert.id} />
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

/**
 * T22: hosted spend per active streamer for the range, from
 * `admin.spend.perStreamer` (priced hosted spend of every account ÷ eligible
 * streamers live in the range). A rise is bad, hence `invert`. Usage with no
 * price at all reads "No prices set" rather than a misleading €0. Opens the
 * Usage page, keeping the date range.
 */
export function OverviewSpendTile({ range }: OverviewSlotProps) {
	const dateRange = useDateRange();
	const navigate = useNavigate();
	const spend = useQuery({
		queryKey: ["admin-spend-per-streamer", range],
		queryFn: () =>
			trpc.admin.spend.perStreamer.query({
				from: range.from,
				to: range.to,
				compareFrom: range.compareFrom,
				compareTo: range.compareTo,
			}),
	});
	const data = spend.data;
	const unpriced =
		data != null && data.totalCostEur === null && data.activeStreamers !== null;
	const formattedValue = spend.isError
		? "Unavailable"
		: unpriced
			? "No prices set"
			: undefined;
	return (
		<KpiTile
			comparisonLabel={comparisonLabel(dateRange)}
			deltaPct={data?.deltaPct ?? null}
			formattedValue={formattedValue}
			formatValue={formatEur}
			invert
			label="Hosted spend per streamer"
			loading={spend.isPending}
			previous={range.compareFrom ? (data?.previous ?? null) : undefined}
			value={data?.value ?? null}
			onClick={() =>
				void navigate({
					to: "/usage",
					search: (prev: Record<string, unknown>) => pickDateRangeSearch(prev),
				})
			}
		/>
	);
}
