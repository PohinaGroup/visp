import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { BarSeriesChart, HorizontalBarChart } from "@VISP/ui/components/charts";
import { KpiTile } from "@VISP/ui/components/kpi-tile";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { toApiRange, useDateRange } from "../app/date-range";
import { PageHeader } from "../components/page-header";
import { WeeklyBudgetsCard } from "../components/weekly-budgets";
import { trpc } from "../lib";
import {
	bucketLabel,
	DESTINATIONS,
	fixedSeries,
	formatCount,
	formatEur,
	formatPct,
	HOSTED_FEATURES,
	pivotBuckets,
	UNIT_LABELS,
	UNIT_PRICE_SQL,
} from "../lib/usage";

type UsageRange = { from: string; to: string; interval: "day" | "week" };
type HostedResult = Awaited<
	ReturnType<typeof trpc.admin.usage.hostedSeries.query>
>;
type TopUser = Awaited<
	ReturnType<typeof trpc.admin.usage.topUsers.query>
>["users"][number];

const COMPARISON = "vs previous period";

function sum(values: readonly number[] | undefined) {
	return values?.reduce((total, value) => total + value, 0);
}

/** Bucket totals in order, for tile sparklines. */
function bucketTotals(rows: readonly { bucket: string; value: number }[]) {
	const totals = new Map<string, number>();
	for (const row of rows) {
		totals.set(row.bucket, (totals.get(row.bucket) ?? 0) + row.value);
	}
	return [...totals.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, value]) => value);
}

/** The usage queries for one window, so the comparison reuses them as is. */
function useUsageWindow(range: UsageRange | null, scope: string) {
	const enabled = range !== null;
	const input = range ?? { from: "", to: "", interval: "day" as const };
	const key = [range?.from, range?.to, range?.interval];
	return {
		hours: useQuery({
			queryKey: ["admin-usage-hours", scope, ...key],
			queryFn: () =>
				trpc.admin.metrics.series.query({
					metric: "streaming_hours",
					...input,
				}),
			enabled,
		}),
		hosted: useQuery({
			queryKey: ["admin-usage-hosted", scope, ...key],
			queryFn: () => trpc.admin.usage.hostedSeries.query(input),
			enabled,
		}),
		encoder: useQuery({
			queryKey: ["admin-usage-encoder", scope, ...key],
			queryFn: () => trpc.admin.usage.encoderSeries.query(input),
			enabled,
		}),
	};
}

function Banner({ children }: { children: ReactNode }) {
	return (
		<div
			className="flex gap-3 border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
			role="status"
		>
			<TriangleAlert
				aria-hidden="true"
				className="mt-0.5 size-4 shrink-0 text-amber-500"
			/>
			<div className="grid min-w-0 gap-2">{children}</div>
		</div>
	);
}

/**
 * The pricing caveat for the spend chart: no prices at all (show the SQL to
 * add them), or some usage without a price (spend is a lower bound).
 */
function PricingBanner({ hosted }: { hosted: HostedResult | undefined }) {
	if (!hosted || hosted.pricedShare === null) return null;
	if (hosted.totalCostEur === null) {
		return (
			<Banner>
				<p className="font-medium">No prices set — insert unit_price rows</p>
				<p className="text-muted-foreground">
					Hosted usage is metered, but no <code>unit_price</code> row is in
					effect for it, so units are charted instead of EUR. Prices are entered
					by hand, effective from <code>valid_from</code>; a row with a null
					provider is the catch-all.
				</p>
				<pre className="overflow-x-auto bg-muted p-2 font-mono text-xs">
					{UNIT_PRICE_SQL}
				</pre>
			</Banner>
		);
	}
	if (hosted.pricedShare >= 1) return null;
	const unpriced = hosted.features
		.filter((feature) => (feature.pricedShare ?? 1) < 1)
		.map(
			(feature) =>
				HOSTED_FEATURES.find((entry) => entry.key === feature.feature)?.label ??
				feature.feature,
		);
	return (
		<Banner>
			<p className="font-medium">
				{formatPct((1 - hosted.pricedShare) * 100)} of hosted usage has no price
			</p>
			<p className="text-muted-foreground">
				Spend is understated. Unpriced: {unpriced.join(", ")}. Add{" "}
				<code>unit_price</code> rows covering that usage.
			</p>
		</Banner>
	);
}

function HostedChart({
	hosted,
	loading,
}: {
	hosted: HostedResult | undefined;
	loading: boolean;
}) {
	const interval = hosted?.interval ?? "day";
	const tick = bucketLabel(interval);
	const priced = hosted ? hosted.totalCostEur !== null : true;
	if (priced) {
		const data = pivotBuckets(
			hosted?.buckets ?? [],
			(row) => row.feature,
			(row) => row.costEur,
		);
		const series = fixedSeries(
			HOSTED_FEATURES,
			new Set(hosted?.buckets.map((row) => row.feature)),
		);
		return (
			<BarSeriesChart
				ariaLabel="Hosted spend per bucket by feature, EUR"
				categoryLabel="Bucket"
				data={data}
				emptyMessage="No hosted usage in this range."
				loading={loading}
				series={series}
				stacked
				valueFormatter={formatEur}
				xKey="bucket"
				xTickFormatter={tick}
			/>
		);
	}
	// Without prices the only measure is units, and characters and seconds
	// share no axis, so each feature gets its own small chart.
	return (
		<div className="grid gap-4 md:grid-cols-2">
			{(hosted?.features ?? []).map((feature) => {
				const index = HOSTED_FEATURES.findIndex(
					(entry) => entry.key === feature.feature,
				);
				const label = HOSTED_FEATURES[index]?.label ?? feature.feature;
				const unit = UNIT_LABELS[feature.unit] ?? feature.unit;
				const data = pivotBuckets(
					hosted?.buckets.filter(
						(row) =>
							row.feature === feature.feature && row.unit === feature.unit,
					) ?? [],
					() => "units",
					(row) => row.units,
				);
				const [series] = fixedSeries(
					HOSTED_FEATURES,
					new Set([feature.feature]),
				);
				return (
					<div key={`${feature.feature}:${feature.unit}`}>
						<p className="mb-2 font-medium text-sm">
							{label}{" "}
							<span className="font-normal text-muted-foreground">
								({unit})
							</span>
						</p>
						<BarSeriesChart
							ariaLabel={`${label} usage per bucket, ${unit}`}
							categoryLabel="Bucket"
							data={data}
							height={180}
							series={[{ key: "units", label: unit, color: series?.color }]}
							valueFormatter={formatCount}
							xKey="bucket"
							xTickFormatter={tick}
						/>
					</div>
				);
			})}
		</div>
	);
}

function hostedUsageText(user: TopUser) {
	if (user.usage.length === 0) return "—";
	return user.usage
		.map((entry) => {
			const label =
				HOSTED_FEATURES.find((feature) => feature.key === entry.feature)
					?.label ?? entry.feature;
			return `${label}: ${formatCount(entry.units)} ${UNIT_LABELS[entry.unit] ?? entry.unit}`;
		})
		.join(" · ");
}

function TopUsersTable({
	users,
	loading,
}: {
	users: TopUser[] | undefined;
	loading: boolean;
}) {
	if (loading) {
		return <p className="p-6 text-muted-foreground text-sm">Loading…</p>;
	}
	if (!users?.length) {
		return (
			<p className="p-6 text-center text-muted-foreground text-sm">
				No hosted usage or Direct forwarding in this range.
			</p>
		);
	}
	return (
		<div className="overflow-x-auto">
			<table className="admin-table">
				<thead>
					<tr>
						<th>User</th>
						<th className="text-right">Hosted spend</th>
						<th>Hosted usage</th>
						<th className="text-right">Hours streamed</th>
						<th className="text-right">Encoder minutes</th>
					</tr>
				</thead>
				<tbody>
					{users.map((user) => (
						<tr key={user.id}>
							<td>
								<Link
									className="block min-w-0 hover:underline"
									search={{ user: user.id }}
									to="/users"
								>
									<span className="block truncate font-medium">
										{user.name}
									</span>
									<span className="block truncate text-muted-foreground text-xs">
										{user.email}
									</span>
								</Link>
							</td>
							<td className="text-right font-mono">
								{user.costEur === null ? "—" : formatEur(user.costEur)}
							</td>
							<td className="text-muted-foreground text-xs">
								{hostedUsageText(user)}
							</td>
							<td className="text-right font-mono">
								{formatCount(user.hoursStreamed)}
							</td>
							<td className="text-right font-mono">
								{formatCount(user.encoderMinutes)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function Section({
	title,
	description,
	children,
}: {
	title: string;
	description?: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle className="text-lg">{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent className="grid gap-4">{children}</CardContent>
		</Card>
	);
}

/**
 * Usage and cost: what streamers consume (live hours, relay encoder time) and
 * what VISP pays for (hosted TTS / audio isolation), for the global date
 * range. Spend counts every account because it is a real invoice; the
 * adoption chart and leaderboard exclude admin and test accounts.
 */
export function UsagePage() {
	const range = useDateRange();
	const api = toApiRange(range);
	const current = { from: api.from, to: api.to, interval: api.interval };
	const previous =
		api.compareFrom && api.compareTo
			? { from: api.compareFrom, to: api.compareTo, interval: api.interval }
			: null;
	const now = useUsageWindow(current, "current");
	const before = useUsageWindow(previous, "previous");
	const key = [api.from, api.to, api.interval];
	const adoption = useQuery({
		queryKey: ["admin-usage-adoption", ...key],
		queryFn: () => trpc.admin.usage.featureAdoption.query(current),
	});
	const topUsers = useQuery({
		queryKey: ["admin-usage-top-users", ...key],
		queryFn: () => trpc.admin.usage.topUsers.query(current),
	});

	const hours = now.hours.data?.buckets;
	const hosted = now.hosted.data;
	const encoder = now.encoder.data;
	const tick = bucketLabel(api.interval);

	const encoderData = pivotBuckets(
		encoder?.buckets ?? [],
		(row) => row.destination,
		(row) => row.minutes,
	);
	const encoderSeries = fixedSeries(
		DESTINATIONS,
		new Set(encoder?.buckets.map((row) => row.destination)),
	);
	const adoptionData = (adoption.data?.features ?? []).map((feature) => ({
		label: feature.basis === "current" ? `${feature.label}*` : feature.label,
		share: feature.share === null ? 0 : feature.share * 100,
	}));
	const hostedSpend = hosted?.totalCostEur;

	return (
		<div className="grid gap-6">
			<PageHeader
				description="Streaming hours, relay encoder time, hosted feature spend, and feature adoption."
				title="Usage and cost"
			/>

			<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<KpiTile
					comparisonLabel={previous ? COMPARISON : undefined}
					formatValue={(value) => `${formatCount(value)} h`}
					label="Streaming hours"
					loading={now.hours.isPending}
					previous={
						previous
							? sum(before.hours.data?.buckets.map((b) => b.value))
							: undefined
					}
					sparkline={hours?.map((bucket) => bucket.value)}
					value={sum(hours?.map((bucket) => bucket.value))}
				/>
				<KpiTile
					comparisonLabel={previous ? COMPARISON : undefined}
					formatValue={formatCount}
					label="Encoder minutes"
					loading={now.encoder.isPending}
					previous={previous ? before.encoder.data?.totalMinutes : undefined}
					sparkline={bucketTotals(
						encoder?.buckets.map((row) => ({
							bucket: row.bucket,
							value: row.minutes,
						})) ?? [],
					)}
					value={encoder?.totalMinutes}
				/>
				<KpiTile
					comparisonLabel={previous ? COMPARISON : undefined}
					formatValue={formatCount}
					label="Peak concurrent forwarders"
					loading={now.encoder.isPending}
					previous={previous ? before.encoder.data?.peak : undefined}
					sparkline={encoder?.peaks.map((bucket) => bucket.peak)}
					value={encoder?.peak}
				/>
				<KpiTile
					comparisonLabel={previous ? COMPARISON : undefined}
					formatValue={formatEur}
					invert
					label="Hosted spend"
					loading={now.hosted.isPending}
					previous={
						previous ? (before.hosted.data?.totalCostEur ?? null) : undefined
					}
					sparkline={bucketTotals(
						hosted?.buckets.map((row) => ({
							bucket: row.bucket,
							value: row.costEur ?? 0,
						})) ?? [],
					)}
					value={hostedSpend ?? null}
				/>
			</section>

			<Section
				description={
					<>
						Units × the <code>unit_price</code> in effect when they were used.
						Subtitles are not metered yet: the client streams audio directly to
						the provider, so that spend never reaches VISP's servers.
					</>
				}
				title="Hosted spend by feature"
			>
				<PricingBanner hosted={hosted} />
				<HostedChart hosted={hosted} loading={now.hosted.isPending} />
			</Section>

			<WeeklyBudgetsCard />

			<Section
				description="Direct forwarder time per destination, clipped to each bucket. Open forwarders count until now."
				title="Encoder minutes by destination"
			>
				<BarSeriesChart
					ariaLabel="Encoder minutes per bucket by destination"
					categoryLabel="Bucket"
					data={encoderData}
					emptyMessage="No Direct forwarding in this range."
					loading={now.encoder.isPending}
					series={encoderSeries}
					stacked
					valueFormatter={formatCount}
					xKey="bucket"
					xTickFormatter={tick}
				/>
			</Section>

			<Section
				description={
					<>
						Share of the{" "}
						{adoption.data ? formatCount(adoption.data.activeStreamers) : "—"}{" "}
						streamers live in this range (admin and test accounts excluded) who
						used each feature in it. * marks a current setting rather than use
						in the range, because no history is kept for it: chat bot enabled,
						multichat overlay issued with an enabled source, production mode set
						to Cloud Studio. OBS plugin counts users last seen by the plugin in
						the range.
					</>
				}
				title="Feature adoption"
			>
				<HorizontalBarChart
					ariaLabel="Share of active streamers using each feature, percent"
					categoryKey="label"
					categoryLabel="Feature"
					categoryWidth={180}
					data={adoption.data?.activeStreamers ? adoptionData : []}
					emptyMessage="Nobody streamed in this range."
					loading={adoption.isPending}
					series={[{ key: "share", label: "Active streamers" }]}
					valueFormatter={formatPct}
				/>
			</Section>

			<Section
				description="Ranked by hosted spend, then unpriced hosted units, then encoder minutes. Admin and test accounts are excluded."
				title="Top 20 users"
			>
				<TopUsersTable
					loading={topUsers.isPending}
					users={topUsers.data?.users}
				/>
			</Section>
		</div>
	);
}
