import type { Faq as FaqCopy } from "@/lib/landing-copy";

import { mktH2 } from "./styles";

/** Collapsed by default; every answer is in the HTML for crawlers. */
export function Faq({ copy }: { copy: FaqCopy }) {
	return (
		<div>
			<h2 className={mktH2}>{copy.title}</h2>
			<div className="mt-8 max-w-[52rem] border-ink/15 border-t">
				{copy.items.map((item) => (
					<details key={item.q} className="group border-ink/15 border-b">
						<summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-6 py-3 font-semibold leading-snug [&::-webkit-details-marker]:hidden">
							{item.q}
							<Plus />
						</summary>
						<p className="max-w-[70ch] pb-6 text-ink-muted leading-relaxed">
							{item.a}
						</p>
					</details>
				))}
			</div>
		</div>
	);
}

function Plus() {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 16 16"
			className="size-4 shrink-0 fill-none stroke-ink transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
			strokeWidth={2}
		>
			<path d="M8 2v12M2 8h12" />
		</svg>
	);
}
