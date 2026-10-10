import { Checkbox } from "@VISP/ui/components/checkbox";
import { Input } from "@VISP/ui/components/input";
import {
	NativeSelect,
	NativeSelectOption,
} from "@VISP/ui/components/native-select";
import { CalendarRange } from "lucide-react";
import { useId } from "react";
import {
	formatDateRange,
	formatIsoDate,
	PRESET_LABELS,
	parseIsoDate,
	RANGE_PRESETS,
	type RangePreset,
	selectionOf,
	useDateRange,
	useSetDateRange,
	useUtcNow,
	utcDay,
} from "../app/date-range";

/**
 * Header control for the global dashboard window: preset, custom bounds, and
 * whether deltas compare against the previous equal-length window. State lives
 * in the URL (see `app/date-range.ts`), so this component holds none.
 */
export function DateRangeControl() {
	const range = useDateRange();
	const setRange = useSetDateRange();
	const id = useId();
	const today = formatIsoDate(utcDay(useUtcNow()));

	const choosePreset = (preset: RangePreset) => {
		// Entering custom starts from the window already on screen.
		setRange(
			preset === "custom"
				? {
						preset,
						from: range.from,
						to: range.to,
						compare: range.compare,
					}
				: { preset, compare: range.compare },
		);
	};

	/**
	 * Moving one bound past the other drags the other along, so the URL never
	 * holds a reversed window (which would fall back to the default preset).
	 */
	const setBound = (bound: "from" | "to", value: string) => {
		if (parseIsoDate(value) === null) return;
		let { from, to } = range;
		if (bound === "from") {
			from = value;
			if (from > to) to = from;
		} else {
			to = value;
			if (to < from) from = to;
		}
		setRange({ preset: "custom", from, to, compare: range.compare });
	};

	return (
		<div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
			<div className="flex items-center gap-2">
				<CalendarRange
					aria-hidden="true"
					className="size-4 shrink-0 text-muted-foreground"
				/>
				<NativeSelect
					aria-label="Date range"
					size="sm"
					value={range.preset}
					onChange={(event) => choosePreset(event.target.value as RangePreset)}
				>
					{RANGE_PRESETS.map((preset) => (
						<NativeSelectOption key={preset} value={preset}>
							{PRESET_LABELS[preset]}
						</NativeSelectOption>
					))}
				</NativeSelect>
			</div>
			{range.preset === "custom" && (
				<div className="flex items-center gap-1.5">
					<Input
						aria-label="From"
						className="h-7 w-[8.5rem]"
						max={today}
						type="date"
						value={range.from}
						onChange={(event) => setBound("from", event.target.value)}
					/>
					<span aria-hidden="true" className="text-muted-foreground text-xs">
						–
					</span>
					<Input
						aria-label="To"
						className="h-7 w-[8.5rem]"
						max={today}
						type="date"
						value={range.to}
						onChange={(event) => setBound("to", event.target.value)}
					/>
				</div>
			)}
			<label
				className="flex cursor-pointer items-center gap-2 text-xs"
				htmlFor={`${id}-compare`}
			>
				<Checkbox
					checked={range.compare === "previous"}
					id={`${id}-compare`}
					onCheckedChange={(checked) =>
						setRange({
							...selectionOf(range),
							compare: checked ? "previous" : "none",
						})
					}
				/>
				Compare
			</label>
			<p
				aria-live="polite"
				className="min-w-0 truncate font-mono text-muted-foreground text-xs"
				title={`UTC days, ${range.interval === "day" ? "daily" : "weekly"} buckets`}
			>
				{formatDateRange(range)}
			</p>
		</div>
	);
}
