import { Button } from "@VISP/ui/components/button";
import { Skeleton } from "@VISP/ui/components/skeleton";
import { downloadCsv, toCsv } from "@VISP/ui/lib/csv";
import { Download } from "lucide-react";
import type { ReactNode } from "react";
import {
	HEATMAP_BUCKETS,
	heatmapFill,
	heatmapOffsets,
	type RetentionCohort,
	retentionCsvRows,
} from "../lib/growth";

const COHORT_LABEL = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC",
});
const PERCENT = new Intl.NumberFormat("en-US", {
	style: "percent",
	maximumFractionDigits: 0,
});
const COUNT = new Intl.NumberFormat("en-US");

/**
 * Retention cohort grid: one row per first-stream week, one column per week
 * offset, each cell shaded by the share of the cohort live that week. It is a
 * real `<table>` (row and column headers, a caption) whose cells happen to be
 * coloured, so screen readers navigate it like any table and the colour is
 * never the only carrier of the value: every observed cell prints its
 * percentage. Weeks that have not ended yet are blank, not 0%.
 */
export function CohortHeatmap({
	cohorts,
	caption,
	loading,
	emptyMessage,
	exportFilename,
}: {
	cohorts: readonly RetentionCohort[] | undefined;
	caption: string;
	loading?: boolean;
	emptyMessage?: ReactNode;
	exportFilename?: string;
}) {
	if (loading) {
		return (
			<div aria-busy="true" aria-label={caption} role="status">
				<Skeleton className="h-48 w-full" />
				<span className="sr-only">Loading…</span>
			</div>
		);
	}
	// Cohorts with no members have nothing to shade; treat all-empty as empty.
	if (!cohorts?.some((cohort) => cohort.size > 0)) {
		return (
			<div className="flex h-48 w-full items-center justify-center border border-border border-dashed px-4 text-center text-muted-foreground text-xs">
				{emptyMessage ?? "No cohorts for this period"}
			</div>
		);
	}

	const offsets = heatmapOffsets(cohorts);
	const exportCsv = () => {
		const { rows } = retentionCsvRows(cohorts);
		const columns = [
			{ key: "cohort", header: "Cohort week" },
			{ key: "size", header: "Cohort size" },
			...offsets.map((offset) => ({
				key: `week${offset}`,
				header: `Week ${offset}`,
			})),
		];
		if (exportFilename)
			downloadCsv(exportFilename, toCsv(rows, columns, { bom: true }));
	};

	return (
		<div className="grid gap-3">
			{exportFilename ? (
				<div className="flex justify-end">
					<Button
						aria-label={`Download CSV: ${caption}`}
						className="text-muted-foreground"
						onClick={exportCsv}
						size="icon-xs"
						title="Download CSV"
						type="button"
						variant="ghost"
					>
						<Download aria-hidden="true" />
					</Button>
				</div>
			) : null}
			<div className="overflow-x-auto">
				<table className="w-full border-separate border-spacing-0.5 text-xs tabular-nums">
					<caption className="sr-only">{caption}</caption>
					<thead>
						<tr>
							<th
								className="px-2 py-1 text-left font-medium text-muted-foreground"
								scope="col"
							>
								Cohort week
							</th>
							<th
								className="px-2 py-1 text-right font-medium text-muted-foreground"
								scope="col"
							>
								Size
							</th>
							{offsets.map((offset) => (
								<th
									className="min-w-12 px-2 py-1 text-center font-medium text-muted-foreground"
									key={offset}
									scope="col"
								>
									Week {offset}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{cohorts.map((cohort) => {
							const label = COHORT_LABEL.format(new Date(cohort.cohort));
							return (
								<tr key={cohort.cohort}>
									<th
										className="whitespace-nowrap px-2 py-1 text-left font-normal"
										scope="row"
									>
										{label}
									</th>
									<td className="px-2 py-1 text-right text-muted-foreground">
										{COUNT.format(cohort.size)}
									</td>
									{offsets.map((offset) => {
										const cell = cohort.cells.find(
											(item) => item.offset === offset,
										);
										const value = cell?.value ?? null;
										if (cell?.count == null || value === null) {
											return (
												<td className="px-2 py-1" key={offset}>
													<span className="sr-only">
														{cell?.count == null
															? "Not yet observed"
															: "Empty cohort"}
													</span>
												</td>
											);
										}
										return (
											<td
												className="px-2 py-1 text-center text-foreground"
												key={offset}
												style={{ background: heatmapFill(value) }}
												title={`${label}, week ${offset}: ${COUNT.format(cell.count)} of ${COUNT.format(cohort.size)} live`}
											>
												{PERCENT.format(value)}
												<span className="sr-only">
													{` (${COUNT.format(cell.count)} of ${COUNT.format(cohort.size)})`}
												</span>
											</td>
										);
									})}
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			<HeatmapLegend />
		</div>
	);
}

/** The shading scale, so each step's colour can be read back as a range. */
function HeatmapLegend() {
	return (
		<ul
			aria-label="Shading scale"
			className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs"
		>
			{HEATMAP_BUCKETS.map((bucket) => (
				<li className="flex items-center gap-1.5" key={bucket.label}>
					<span
						aria-hidden="true"
						className="inline-block size-3 border border-border"
						style={{
							background: `color-mix(in oklab, var(--chart-1) ${Math.round(bucket.opacity * 100)}%, transparent)`,
						}}
					/>
					{bucket.label}
				</li>
			))}
			<li className="flex items-center gap-1.5">
				<span
					aria-hidden="true"
					className="inline-block size-3 border border-border border-dashed"
				/>
				Not yet observed
			</li>
		</ul>
	);
}
