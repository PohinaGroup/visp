import { type CSSProperties, useId } from "react";

import type { StripCopy } from "@/lib/landing-copy";

import { mktH2 } from "./styles";

// Signal level per moment (0–4). One array drives both orientations.
const LEVELS = [3, 4, 4, 3, 2, 1, 0, 0, 0, 2, 4, 4] as const;
const MAX = 4;

// Viewers see LIVE while any signal gets through and BRB while it is gone.
// The three runs are the three beats.
type Run = { live: boolean; start: number; end: number };
const RUNS = LEVELS.reduce<Run[]>((runs, level, i) => {
	const last = runs.at(-1);
	if (last && last.live === level > 0) last.end = i + 1;
	else runs.push({ live: level > 0, start: i, end: i + 1 });
	return runs;
}, []);

const barFill = (level: number) =>
	level >= 3 ? "fill-(--signal)" : "fill-(--weak)";
const ghost = "fill-none stroke-ink-muted";

// Horizontal (md and up): a fixed viewBox that scales with the page. Bars and
// gaps are equal width, like the logo's meter mark.
const SLOT = 64;
const BAR = 32;
const W = (LEVELS.length - 1) * SLOT + BAR;
const runX = (r: Run) => r.start * SLOT;
const runW = (r: Run, i: number) =>
	(RUNS[i + 1] ? runX(RUNS[i + 1]) : W) - runX(r);
// SVG text scales with the viewBox; step it down as the strip widens so it
// stays near body size (≥ 17px at 768px).
const hText = "text-[18px] lg:text-[15px] xl:text-[13px]";

// Vertical (below md): no viewBox, px across and % down, so it stretches to
// the caption list. The list's rows share its height in fixed ratios, which
// lets each beat sit at a known percentage.
const V_ROWS = [5, 7, 4];
const V_TOTAL = V_ROWS.reduce((a, b) => a + b, 0);
const vTop = (i: number) =>
	(V_ROWS.slice(0, i).reduce((a, b) => a + b, 0) / V_TOTAL) * 100;
const V_UNIT = 10;
const V_THICK = 8;
const V_SLOT = 14;
const V_LINE_X = 54;
// Equals the list's left padding (4.75rem), so tags line up with captions.
const V_TEXT_X = 76;

export function SignalStrip({
	copy,
	compact = false,
}: {
	copy: StripCopy;
	compact?: boolean;
}) {
	const id = useId();
	const unit = compact ? 14 : 22;
	const barsTop = 40;
	const base = barsTop + MAX * unit;
	const viewerLabel = base + 40;
	const line = viewerLabel + 22;
	const tag = line + 32;
	const desc = `${copy.viewerTrack}: ${RUNS.map((r) => (r.live ? copy.live : copy.brb)).join(", ")}`;

	return (
		<div>
			{compact ? null : <h2 className={mktH2}>{copy.label}</h2>}

			<svg
				role="img"
				aria-labelledby={`${id}h-t ${id}h-d`}
				viewBox={`0 0 ${W} ${tag + 10}`}
				className={`hidden h-auto w-full md:block ${compact ? "" : "mt-10"}`}
			>
				<title id={`${id}h-t`}>{copy.label}</title>
				<desc id={`${id}h-d`}>{desc}</desc>
				<text x={0} y={18} className={`fill-ink-muted font-medium ${hText}`}>
					{copy.signalTrack}
				</text>
				<g className="strip-play">
					{LEVELS.map((level, i) =>
						level === 0 ? (
							<rect
								key={i}
								x={i * SLOT + 0.75}
								y={barsTop + 0.75}
								width={BAR - 1.5}
								height={MAX * unit - 1.5}
								className={ghost}
								strokeWidth={1.5}
								strokeDasharray="4 4"
							/>
						) : (
							<rect
								key={i}
								x={i * SLOT}
								y={base - level * unit}
								width={BAR}
								height={level * unit}
								className={barFill(level)}
							/>
						),
					)}
				</g>
				<text
					x={0}
					y={viewerLabel}
					className={`fill-ink-muted font-medium ${hText}`}
				>
					{copy.viewerTrack}
				</text>
				<path
					data-on-air
					d={`M2 ${line}H${W - 2}`}
					className="fill-none stroke-on-air"
					strokeWidth={4}
					strokeLinecap="round"
				/>
				{RUNS.map((r) => (
					<g key={r.start} transform={`translate(${runX(r)} ${tag})`}>
						<Dot live={r.live} r={5} cx={5} cy={-6} />
						<text x={16} className={`fill-ink font-semibold ${hText}`}>
							{r.live ? copy.live : copy.brb}
						</text>
					</g>
				))}
			</svg>

			<div
				className={`relative md:mt-3 ${compact ? "mt-12" : "mt-20"}`}
				style={
					{
						"--strip-rows": V_ROWS.map((n) => `${n}fr`).join(" "),
						"--strip-cols": RUNS.map((r, i) => `${runW(r, i)}fr`).join(" "),
					} as CSSProperties
				}
			>
				<svg
					role="img"
					aria-labelledby={`${id}v-t ${id}v-d`}
					className="pointer-events-none absolute inset-y-0 left-0 h-full w-16 overflow-visible md:hidden"
				>
					<title id={`${id}v-t`}>{copy.label}</title>
					<desc id={`${id}v-d`}>{desc}</desc>
					<rect
						x={0}
						y={-46}
						width={16}
						height={V_THICK}
						className="fill-(--signal)"
					/>
					<text x={24} y={-38} className="fill-ink-muted font-medium text-sm">
						{copy.signalTrack}
					</text>
					<path
						d="M0 -16H16"
						className="fill-none stroke-on-air"
						strokeWidth={3}
					/>
					<text x={24} y={-11} className="fill-ink-muted font-medium text-sm">
						{copy.viewerTrack}
					</text>
					<g className="strip-play strip-play-y">
						{RUNS.flatMap((r, ri) =>
							LEVELS.slice(r.start, r.end).map((level, k) => {
								const y = `${vTop(ri)}%`;
								const dy = 8 + k * V_SLOT;
								return level === 0 ? (
									<rect
										key={r.start + k}
										x={0.75}
										y={y}
										transform={`translate(0 ${dy + 0.75})`}
										width={MAX * V_UNIT - 1.5}
										height={V_THICK - 1.5}
										className={ghost}
										strokeWidth={1.5}
										strokeDasharray="3 3"
									/>
								) : (
									<rect
										key={r.start + k}
										x={0}
										y={y}
										transform={`translate(0 ${dy})`}
										width={level * V_UNIT}
										height={V_THICK}
										className={barFill(level)}
									/>
								);
							}),
						)}
					</g>
					{/* A path can't take % coordinates, so it lives in a nested svg
					    that stretches to the full height; the stroke stays 3px. */}
					<svg
						aria-hidden="true"
						x={V_LINE_X - 2}
						width={4}
						height="100%"
						viewBox="0 0 4 100"
						preserveAspectRatio="none"
					>
						<path
							data-on-air
							d="M2 0V100"
							className="fill-none stroke-on-air"
							strokeWidth={3}
							vectorEffect="non-scaling-stroke"
						/>
					</svg>
					{RUNS.map((r, ri) => (
						<g key={r.start} transform="translate(0 12)">
							<Dot live={r.live} r={4} cx={V_TEXT_X + 4} cy={`${vTop(ri)}%`} />
							<text
								x={V_TEXT_X + 14}
								y={`${vTop(ri)}%`}
								dy={5}
								className="fill-ink font-semibold text-sm"
							>
								{r.live ? copy.live : copy.brb}
							</text>
						</g>
					))}
				</svg>

				<ol className="grid grid-rows-(--strip-rows) pl-[4.75rem] md:grid-cols-(--strip-cols) md:grid-rows-none md:pl-0">
					{copy.beats.map((beat, i) => (
						<li
							key={beat}
							className="pt-7 pb-8 last:pb-0 md:pt-0 md:pr-6 md:pb-0"
						>
							<p className="font-semibold text-ink leading-snug">{beat}</p>
							<p className="mt-1.5 max-w-[46ch] text-ink-muted leading-normal md:text-[0.9375rem] lg:text-[1.0625rem]">
								{copy.details[i]}
							</p>
						</li>
					))}
				</ol>
			</div>
		</div>
	);
}

/** Red tally dot while live; an empty ring while viewers see the BRB screen. */
function Dot({
	live,
	r,
	cx,
	cy,
}: {
	live: boolean;
	r: number;
	cx: number;
	cy: number | string;
}) {
	return live ? (
		<circle cx={cx} cy={cy} r={r} className="fill-on-air" />
	) : (
		<circle
			cx={cx}
			cy={cy}
			r={r - 0.75}
			className="fill-none stroke-ink-muted"
			strokeWidth={1.5}
		/>
	);
}
