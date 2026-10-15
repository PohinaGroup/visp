import { Link } from "@tanstack/react-router";

import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";

import { ComparisonTable } from "./comparison-table";
import { CostChart } from "./cost-chart";
import { Faq } from "./faq";
import { SignalStrip } from "./signal-strip";
import { SituationList } from "./situation-list";
import { StepList } from "./step-list";
import { mktH2 } from "./styles";

const LEAD = "mt-6 max-w-[62ch] leading-relaxed md:text-[1.1875rem]";

/**
 * Phone only between the hero and the closing CTA. Needs only a router
 * context for its Link (the test builds a bare one); the route page adds the
 * hero and closing, which need the full router for TryCta. Children of the
 * page's flex column.
 */
export function PhoneOnlySections({ locale }: { locale: Locale }) {
	const page = landingCopy[locale].phoneOnly;
	const { studio, versus, cost, obsNote } = page;
	const base = locale === "fi" ? "/fi" : "";

	return (
		<>
			<section>
				<h2 className={mktH2}>{page.why.title}</h2>
				<p className={LEAD}>{page.why.body}</p>
			</section>

			<section>
				<h2 className={mktH2}>{page.situationsTitle}</h2>
				<div className="mt-10 md:mt-12">
					<SignalStrip copy={page.strip} compact />
				</div>
				<div className="mt-16 md:mt-20">
					<SituationList items={page.situations} />
				</div>
			</section>

			<section className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-12">
				<div>
					<span className="inline-block rounded-lg border border-ink/35 px-2.5 py-1 font-semibold text-sm">
						{studio.beta}
					</span>
					<h2 className={`${mktH2} mt-4`}>{studio.heading}</h2>
				</div>
				<div className="mt-6 lg:mt-12">
					<p className="max-w-[70ch] leading-relaxed">{studio.body}</p>
					<p className="mt-3 text-ink-muted text-sm">{studio.feature}</p>
				</div>
			</section>

			<section>
				<h2 className={mktH2}>{page.more.title}</h2>
				<div className="mt-10 md:mt-12">
					<SituationList items={page.more.items} />
				</div>
			</section>

			<section>
				<h2 className={mktH2}>{versus.title}</h2>
				<div className="mt-10 md:mt-12">
					<ComparisonTable
						caption={versus.caption}
						columns={versus.columns}
						rows={versus.rows.map((r) => ({
							label: r.label,
							cells: [r.phone, r.obs],
						}))}
					/>
				</div>
			</section>

			<section className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-12">
				<div>
					<h2 className={mktH2}>{cost.heading}</h2>
					<p className={LEAD}>{cost.body}</p>
				</div>
				<CostChart copy={cost} affiliateHref={`${base}/affiliate`} />
			</section>

			<section>
				<StepList title={page.steps.title} items={page.steps.items} />
				<p className="mt-14 max-w-[62ch] leading-relaxed">{obsNote.text}</p>
				<Link
					to={locale === "fi" ? "/fi/with-obs" : "/with-obs"}
					className="mt-1 inline-flex min-h-11 items-center font-semibold underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
				>
					{obsNote.link}
				</Link>
			</section>

			<section>
				<Faq copy={page.faq} />
			</section>
		</>
	);
}
