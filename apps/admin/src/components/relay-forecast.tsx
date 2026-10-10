import { Badge } from "@VISP/ui/components/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@VISP/ui/components/tooltip";
import { cn } from "@VISP/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { trpc } from "../lib";

/**
 * "When does this relay fill up?" for the Relays table, from
 * `admin.relayForecast.forecast` (linear fit on daily peaks; see
 * packages/api/src/relay-forecast.ts for the method and its limits).
 */

type RelayForecastResult = Awaited<
	ReturnType<typeof trpc.admin.relayForecast.forecast.query>
>;
export type RelayForecastRow = RelayForecastResult["relays"][number];
type ResourceForecast = RelayForecastRow["paths"];

/** Under this many weeks to 80 % the badge turns amber, then red. */
const AMBER_WEEKS = 8;
const RED_WEEKS = 4;
/** Past a year a linear extrapolation of four weeks says nothing useful. */
const HORIZON_WEEKS = 52;

type CapacityStatus =
	| { kind: "above"; pct: number }
	| { kind: "weeks"; weeks: number }
	| { kind: "insufficient" }
	| { kind: "stable" };

/**
 * One resource's status. Being above 80 % is an observation, so it shows even
 * when there are too few days to fit a trend. Null when the resource has no
 * capacity (a relay with zero forwarder slots).
 */
export function capacityStatus(
	forecast: ResourceForecast,
	capacity: number,
): CapacityStatus | null {
	if (capacity <= 0) return null;
	if (forecast.currentPeak !== null && forecast.currentPeak >= capacity * 0.8) {
		return { kind: "above", pct: (forecast.currentPeak / capacity) * 100 };
	}
	if (forecast.slopePerWeek === null) return { kind: "insufficient" };
	if (forecast.slopePerWeek <= 0) return { kind: "stable" };
	if (forecast.weeksTo80Pct === null) return { kind: "insufficient" };
	return { kind: "weeks", weeks: forecast.weeksTo80Pct };
}

/**
 * Lower is more urgent. Missing data ranks above "stable": a relay whose
 * forwarders cannot be forecast must not read as fine because its paths are.
 */
function urgency(status: CapacityStatus) {
	switch (status.kind) {
		case "above":
			return -status.pct;
		case "weeks":
			return status.weeks;
		case "insufficient":
			return Number.MAX_SAFE_INTEGER - 1;
		case "stable":
			return Number.MAX_SAFE_INTEGER;
	}
}

function weeksText(weeks: number) {
	if (weeks < 1) return "<1 week";
	if (weeks > HORIZON_WEEKS) return ">1 year";
	const rounded = Math.round(weeks);
	return `~${rounded} ${rounded === 1 ? "week" : "weeks"}`;
}

function badgeOf(status: CapacityStatus) {
	switch (status.kind) {
		case "above":
			return {
				label: "Above 80%",
				variant: "destructive" as const,
				className: "",
			};
		case "weeks":
			return {
				label: `${weeksText(status.weeks)} to 80%`,
				variant:
					status.weeks < RED_WEEKS
						? ("destructive" as const)
						: ("secondary" as const),
				className:
					status.weeks >= RED_WEEKS && status.weeks < AMBER_WEEKS
						? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
						: "",
			};
		case "stable":
			return { label: "Stable", variant: "secondary" as const, className: "" };
		case "insufficient":
			return {
				label: "Not enough data",
				variant: "outline" as const,
				className: "text-muted-foreground",
			};
	}
}

function signed(value: number) {
	const rounded = value.toFixed(1);
	return value > 0 ? `+${rounded}` : rounded;
}

function ForecastLine({
	label,
	forecast,
	capacity,
}: {
	label: string;
	forecast: ResourceForecast;
	capacity: number;
}) {
	if (capacity <= 0) {
		return (
			<p>
				<span className="font-medium">{label}:</span> no capacity configured
			</p>
		);
	}
	const parts = [
		`peak ${forecast.currentPeak ?? "—"} of ${capacity}`,
		forecast.slopePerWeek === null
			? `${forecast.points} of 7 days needed`
			: `${signed(forecast.slopePerWeek)}/week`,
	];
	if (forecast.weeksTo80Pct !== null) {
		parts.push(`80% in ${weeksText(forecast.weeksTo80Pct)}`);
	}
	if (forecast.weeksTo100Pct !== null) {
		parts.push(`100% in ${weeksText(forecast.weeksTo100Pct)}`);
	}
	const fit =
		forecast.rSquared === null
			? `${forecast.points} days`
			: `${forecast.points} days, R² ${forecast.rSquared.toFixed(2)}`;
	return (
		<p>
			<span className="font-medium">{label}:</span> {parts.join(" · ")}
			<span className="opacity-70">
				{" "}
				({forecast.confidence} confidence, {fit})
			</span>
		</p>
	);
}

/**
 * Forecasts for the whole fleet in one request. The key carries every
 * relay's capacities so editing one in the table refreshes the thresholds;
 * otherwise the daily-peak inputs only change once a day.
 */
export function useRelayForecasts(
	relays:
		| readonly { id: number; capacityPaths: number; maxForwarders: number }[]
		| undefined,
) {
	const capacityKey = relays
		?.map((row) => `${row.id}:${row.capacityPaths}:${row.maxForwarders}`)
		.join(",");
	const query = useQuery({
		queryKey: ["admin-relay-forecast", capacityKey],
		queryFn: () => trpc.admin.relayForecast.forecast.query(),
		enabled: capacityKey !== undefined,
		refetchInterval: 30 * 60_000,
		staleTime: 15 * 60_000,
	});
	return {
		byRelay: new Map(query.data?.relays.map((row) => [row.relayId, row])),
		days: query.data?.days,
		loading: query.isPending,
	};
}

/**
 * The table cell: one badge for the more urgent of paths and forwarders,
 * with both forecasts in the tooltip.
 */
export function RelayCapacityForecast({
	forecast,
	days,
	loading,
}: {
	forecast: RelayForecastRow | undefined;
	days: number | undefined;
	loading: boolean;
}) {
	if (loading) {
		return <p className="text-muted-foreground text-xs">Loading…</p>;
	}
	if (!forecast) {
		return <p className="text-muted-foreground text-xs">No forecast</p>;
	}
	const candidates = [
		{
			resource: "paths",
			status: capacityStatus(forecast.paths, forecast.capacityPaths),
		},
		{
			resource: "forwarders",
			status: capacityStatus(forecast.forwarders, forecast.maxForwarders),
		},
	].filter(
		(entry): entry is { resource: string; status: CapacityStatus } =>
			entry.status !== null,
	);
	const driver = candidates.reduce<(typeof candidates)[number] | undefined>(
		(worst, entry) =>
			!worst || urgency(entry.status) < urgency(worst.status) ? entry : worst,
		undefined,
	);
	const status = driver?.status ?? { kind: "insufficient" };
	const badge = badgeOf(status);
	const showDriver = status.kind === "above" || status.kind === "weeks";
	return (
		<Tooltip>
			<TooltipTrigger
				aria-label={`${forecast.name} capacity forecast: ${badge.label}${
					showDriver && driver ? ` (${driver.resource})` : ""
				}`}
				className="grid justify-items-start gap-0.5 rounded-sm p-1 text-left text-xs outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
				type="button"
			>
				<Badge className={cn(badge.className)} variant={badge.variant}>
					{badge.label}
				</Badge>
				{showDriver && driver ? (
					<span className="text-muted-foreground">{driver.resource}</span>
				) : null}
			</TooltipTrigger>
			<TooltipContent className="grid max-w-sm gap-1 text-left" side="left">
				<ForecastLine
					capacity={forecast.capacityPaths}
					forecast={forecast.paths}
					label="Paths"
				/>
				<ForecastLine
					capacity={forecast.maxForwarders}
					forecast={forecast.forwarders}
					label="Forwarders"
				/>
				<p className="opacity-70">
					Linear trend of daily peaks over the last {days ?? 28} full days.
					Ignores weekly seasonality; low confidence below 14 days of data or a
					weak fit.
				</p>
			</TooltipContent>
		</Tooltip>
	);
}
