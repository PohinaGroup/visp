import type { Step } from "@/lib/landing-copy";

import { mktH2 } from "./styles";

/** A real sequence, so it is the one place numerals appear. */
export function StepList({ title, items }: { title: string; items: Step[] }) {
	return (
		<div>
			<h2 className={mktH2}>{title}</h2>
			<ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
				{items.map((step, i) => (
					<li key={step.title} className="flex gap-5 md:block">
						<span
							aria-hidden
							className="mkt-display w-10 shrink-0 text-[3rem] text-ink tabular-nums md:block md:w-auto md:text-[4rem]"
						>
							{i + 1}
						</span>
						<div className="md:mt-4">
							<h3 className="font-semibold text-[1.25rem] leading-snug">
								{step.title}
							</h3>
							<p className="mt-2 max-w-[70ch] text-ink-muted leading-relaxed">
								{step.body}
							</p>
						</div>
					</li>
				))}
			</ol>
		</div>
	);
}
