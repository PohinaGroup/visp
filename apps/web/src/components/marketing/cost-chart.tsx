import type { CostCopy } from "@/lib/landing-copy";

/** Twelve months of software cost: VISP next to the cloud OBS services. */
export function CostChart({
	copy,
	affiliateHref,
}: {
	copy: CostCopy;
	affiliateHref: string;
}) {
	return (
		<figure className="rounded-xl bg-surface p-5 sm:p-8">
			<figcaption>
				<span className="block font-semibold text-[1.25rem] leading-snug">
					{copy.chartTitle}
				</span>
				<span className="mt-1 block text-ink-muted">{copy.chartSubtitle}</span>
			</figcaption>
			<ul className="mt-8 grid gap-6">
				{copy.rows.map((row) => (
					<li key={row.product}>
						<div className="flex items-baseline justify-between gap-4">
							<span className="font-medium">{row.product}</span>
							<span className="text-right font-semibold tabular-nums">
								{row.cost}
							</span>
						</div>
						<div aria-hidden className="mt-2 h-3 rounded-full bg-ink/10">
							<div
								className="h-full min-w-3 rounded-full bg-ink"
								style={{ width: row.width }}
							/>
						</div>
					</li>
				))}
			</ul>
			<p className="mt-8 text-ink-muted text-sm">{copy.chartNote}</p>
			<p className="mt-2 text-ink-muted text-sm">
				{copy.affiliateNote}{" "}
				<a
					href={affiliateHref}
					className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4"
				>
					{copy.affiliateLink}
				</a>
				<span className="block">{copy.affiliateFootnote}</span>
			</p>
		</figure>
	);
}
