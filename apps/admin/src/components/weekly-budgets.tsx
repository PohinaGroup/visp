import { Button } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { Input } from "@VISP/ui/components/input";
import { cn } from "@VISP/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { trpc } from "../lib";
import {
	BUDGET_TONE_BAR,
	type BudgetFeature,
	budgetBarWidth,
	budgetFeatureLabel,
	budgetPct,
	budgetTone,
	parseBudgetEur,
	unknownSpendReason,
} from "../lib/spend";
import { bucketLabel, formatEur, formatPct } from "../lib/usage";

type BudgetList = Awaited<
	ReturnType<typeof trpc.admin.spend.budgets.list.query>
>;
type BudgetStatus = Awaited<
	ReturnType<typeof trpc.admin.spend.budgets.status.query>
>[number];

const LIST_KEY = ["admin-spend-budgets"];
const STATUS_KEY = ["admin-spend-budget-status"];
const weekLabel = bucketLabel("week");

function spendText(feature: string, spentEur: number | null) {
	if (spentEur === null) {
		return (
			<span
				className="text-muted-foreground"
				title={unknownSpendReason(feature)}
			>
				—
			</span>
		);
	}
	return formatEur(spentEur);
}

/** This week's spend as a share of the budget, coloured by how close it is. */
function BudgetBar({
	spentEur,
	budgetEur,
}: {
	spentEur: number | null;
	budgetEur: number | null;
}) {
	const pct = budgetPct(spentEur, budgetEur);
	const tone = budgetTone(spentEur, budgetEur, pct);
	if (budgetEur === null) {
		return <span className="text-muted-foreground text-xs">No budget</span>;
	}
	if (spentEur === null) {
		return <span className="text-muted-foreground text-xs">Spend unknown</span>;
	}
	const label = pct === null ? "Over" : formatPct(pct);
	return (
		<div className="flex min-w-32 items-center gap-2">
			<div
				aria-label={`${label} of the weekly budget`}
				aria-valuemax={100}
				aria-valuemin={0}
				aria-valuenow={Math.round(budgetBarWidth(tone, pct))}
				className="h-2 flex-1 bg-muted"
				role="progressbar"
			>
				<div
					className={cn("h-full transition-[width]", BUDGET_TONE_BAR[tone])}
					style={{ width: `${budgetBarWidth(tone, pct)}%` }}
				/>
			</div>
			<span
				className={cn(
					"w-12 text-right font-mono text-xs tabular-nums",
					tone === "over" && "text-destructive",
				)}
			>
				{label}
			</span>
		</div>
	);
}

/** The 4 weeks before this one as small swatches, oldest first. */
function PastWeeks({
	weeks,
	budgetEur,
}: {
	weeks: BudgetStatus[];
	budgetEur: number | null;
}) {
	if (weeks.length === 0) return null;
	const summary = weeks
		.map((week) => {
			const pct = budgetPct(week.spentEur, budgetEur);
			const spent =
				week.spentEur === null ? "unknown" : formatEur(week.spentEur);
			return `${weekLabel(week.week)}: ${spent}${pct === null ? "" : ` (${formatPct(pct)})`}`;
		})
		.join(", ");
	return (
		<div className="flex gap-1" title={summary}>
			{weeks.map((week) => {
				const pct = budgetPct(week.spentEur, budgetEur);
				const tone = budgetTone(week.spentEur, budgetEur, pct);
				return (
					<span
						aria-hidden="true"
						className={cn("size-3", BUDGET_TONE_BAR[tone])}
						key={week.week}
					/>
				);
			})}
			<span className="sr-only">{summary}</span>
		</div>
	);
}

function BudgetRow({
	feature,
	weeklyEur,
	current,
	past,
	pending,
	onSave,
}: {
	feature: BudgetFeature;
	weeklyEur: number | null;
	current: BudgetStatus | undefined;
	past: BudgetStatus[];
	pending: boolean;
	onSave: (feature: BudgetFeature, weeklyEur: number | null) => void;
}) {
	const [draft, setDraft] = useState(
		weeklyEur === null ? "" : String(weeklyEur),
	);
	// Follow the stored value when it changes (save, clear, another admin).
	useEffect(() => {
		setDraft(weeklyEur === null ? "" : String(weeklyEur));
	}, [weeklyEur]);
	const parsed = parseBudgetEur(draft);
	const canSave = parsed !== null && parsed !== weeklyEur && !pending;
	const label = budgetFeatureLabel(feature);
	const inputId = `budget-${feature}`;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (canSave) onSave(feature, parsed);
	};

	return (
		<tr>
			<td>
				<label className="font-medium" htmlFor={inputId}>
					{label}
				</label>
			</td>
			<td>
				<form className="flex items-center gap-1.5" onSubmit={submit}>
					<span aria-hidden="true" className="text-muted-foreground text-xs">
						€
					</span>
					<Input
						aria-invalid={draft !== "" && parsed === null ? true : undefined}
						className="w-28 text-right font-mono"
						id={inputId}
						inputMode="decimal"
						onChange={(event) => setDraft(event.target.value)}
						placeholder="No budget"
						value={draft}
					/>
					<Button disabled={!canSave} size="sm" type="submit">
						Save
					</Button>
					<Button
						disabled={weeklyEur === null || pending}
						onClick={() => onSave(feature, null)}
						size="sm"
						type="button"
						variant="outline"
					>
						Clear
					</Button>
				</form>
			</td>
			<td className="text-right font-mono">
				{current ? spendText(feature, current.spentEur) : "…"}
			</td>
			<td>
				{current ? (
					<BudgetBar budgetEur={weeklyEur} spentEur={current.spentEur} />
				) : null}
			</td>
			<td>
				<PastWeeks budgetEur={weeklyEur} weeks={past} />
			</td>
		</tr>
	);
}

/**
 * Weekly EUR budgets per hosted feature (plus relay encoder and the whole
 * hosted bill), with this ISO week's spend against each. Edits apply to the
 * table at once and roll back if the server refuses; every change lands in
 * the audit log. Budgets are independent of the page's date range: they are
 * always about calendar weeks (UTC, Monday to Sunday).
 */
export function WeeklyBudgetsCard() {
	const queryClient = useQueryClient();
	const list = useQuery({
		queryKey: LIST_KEY,
		queryFn: () => trpc.admin.spend.budgets.list.query(),
	});
	const status = useQuery({
		queryKey: STATUS_KEY,
		queryFn: () => trpc.admin.spend.budgets.status.query(),
	});
	const [pending, setPending] = useState<BudgetFeature | null>(null);

	const weeks = [...new Set(status.data?.map((row) => row.week))].sort();
	const currentWeek = weeks.at(-1);

	const save = async (feature: BudgetFeature, weeklyEur: number | null) => {
		const label = budgetFeatureLabel(feature);
		setPending(feature);
		await queryClient.cancelQueries({ queryKey: LIST_KEY });
		const previous = queryClient.getQueryData<BudgetList>(LIST_KEY);
		queryClient.setQueryData<BudgetList>(LIST_KEY, (rows) =>
			rows?.map((row) =>
				row.feature === feature ? { ...row, weeklyEur } : row,
			),
		);
		try {
			if (weeklyEur === null) {
				await trpc.admin.spend.budgets.clear.mutate({ feature });
				toast.success(`${label} budget cleared`);
			} else {
				await trpc.admin.spend.budgets.set.mutate({ feature, weeklyEur });
				toast.success(`${label} budget set to ${formatEur(weeklyEur)} a week`);
			}
		} catch (error) {
			queryClient.setQueryData(LIST_KEY, previous);
			toast.error(
				error instanceof Error ? error.message : "Budget update failed",
			);
		} finally {
			setPending(null);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: LIST_KEY }),
				queryClient.invalidateQueries({ queryKey: STATUS_KEY }),
				queryClient.invalidateQueries({ queryKey: ["admin-audit"] }),
			]);
		}
	};

	return (
		<Card className="border border-border/60">
			<CardHeader>
				<CardTitle className="text-lg">Weekly budgets</CardTitle>
				<CardDescription>
					EUR per ISO week (UTC, Monday to Sunday), whatever the selected range.
					Green below 80 %, amber up to 100 %, red over budget. Spend only
					counts usage with a <code>unit_price</code>; relay encoder time has no
					price yet. Past weeks are compared with today's budget.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{list.isError ? (
					<p className="text-destructive text-sm" role="alert">
						Could not load budgets: {list.error.message}
					</p>
				) : !list.data ? (
					<p className="text-muted-foreground text-sm">Loading…</p>
				) : (
					<div className="overflow-x-auto">
						<table className="admin-table">
							<thead>
								<tr>
									<th>Feature</th>
									<th>Weekly budget</th>
									<th className="text-right">
										This week
										{currentWeek ? (
											<span className="block font-normal normal-case tracking-normal">
												{weekLabel(currentWeek)}
											</span>
										) : null}
									</th>
									<th>Of budget</th>
									<th>Last 4 weeks</th>
								</tr>
							</thead>
							<tbody>
								{list.data.map((budget) => {
									const rows =
										status.data?.filter(
											(row) => row.feature === budget.feature,
										) ?? [];
									return (
										<BudgetRow
											current={rows.find((row) => row.week === currentWeek)}
											feature={budget.feature}
											key={budget.feature}
											onSave={(feature, value) => void save(feature, value)}
											past={rows.filter((row) => row.week !== currentWeek)}
											pending={pending === budget.feature}
											weeklyEur={budget.weeklyEur}
										/>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
				{status.isError ? (
					<p className="mt-2 text-destructive text-sm" role="alert">
						Could not load this week's spend: {status.error.message}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}
