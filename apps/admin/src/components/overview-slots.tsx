import { KpiTile } from "@VISP/ui/components/kpi-tile";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	type ApiRange,
	pickDateRangeSearch,
	useDateRange,
} from "../app/date-range";
import { trpc } from "../lib";
import { comparisonLabel } from "../lib/overview";
import { formatEur } from "../lib/usage";

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

/**
 * SLOT (T23): "Needs attention" panel (failing relays, error spikes, spend
 * over budget). Rendered in the lower row, next to the spend tile.
 */
export function OverviewAttention(_props: OverviewSlotProps) {
	return null;
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
