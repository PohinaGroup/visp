import type { Situation } from "@/lib/landing-copy";

/** Situation first, then what VISP does, then the feature name in small print. */
export function SituationList({ items }: { items: Situation[] }) {
	return (
		<ul className="grid gap-y-12 lg:gap-y-16">
			{items.map((s) => (
				<li
					key={s.heading}
					className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-12"
				>
					<h3 className="mkt-display text-[clamp(1.5rem,3.5vw,2rem)]">
						{s.heading}
					</h3>
					<div className="mt-3 lg:mt-1">
						<p className="max-w-[70ch] leading-relaxed">{s.body}</p>
						<p className="mt-3 text-ink-muted text-sm">{s.feature}</p>
					</div>
				</li>
			))}
		</ul>
	);
}
