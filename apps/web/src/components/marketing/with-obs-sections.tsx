import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
	COMPARISON_CHECKED,
	comparisonProducts,
	comparisonRows,
	comparisonRowsFi,
} from "@/lib/comparison";
import { docs } from "@/lib/docs";
import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { legalEntity } from "@/lib/legal";
import {
	detectObsPluginPlatform,
	type ObsPluginRelease,
} from "@/lib/obs-releases";

import { ComparisonTable } from "./comparison-table";
import { CostChart } from "./cost-chart";
import { Faq } from "./faq";
import { SituationList } from "./situation-list";
import { StepList } from "./step-list";
import { mktButton, mktH2 } from "./styles";

const LEAD = "mt-6 max-w-[62ch] leading-relaxed md:text-[1.1875rem]";
const TEXT_LINK =
	"inline-flex min-h-11 items-center font-semibold underline decoration-ink/30 underline-offset-4 hover:decoration-ink";

/** Above the hero: no studio PC needed, phone only does it too. */
export function WithObsNote({ locale }: { locale: Locale }) {
	const { noPcNote } = landingCopy[locale].withObs;
	return (
		<div className="border-ink/15 border-l-2 pl-4">
			<p className="max-w-[62ch] text-ink-muted leading-relaxed">
				{noPcNote.text}
			</p>
			<Link
				to={locale === "fi" ? "/fi/phone-only" : "/phone-only"}
				className={TEXT_LINK}
			>
				{noPcNote.link}
			</Link>
		</div>
	);
}

/**
 * With OBS between the hero and the closing CTA. Router-free so it renders
 * in tests; the route page adds the note, hero, and closing. Children of the
 * page's flex column.
 */
export function WithObsSections({
	locale,
	release,
}: {
	locale: Locale;
	release: ObsPluginRelease | null;
}) {
	const page = landingCopy[locale].withObs;
	const { plugin, studio, cost } = page;
	const base = locale === "fi" ? "/fi" : "";
	const rows = locale === "fi" ? comparisonRowsFi : comparisonRows;

	return (
		<>
			{/* Phones read title, steps, then the download; wide screens put the
			    steps beside the title and the download under it. */}
			<section className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:gap-x-12">
				<div>
					<h2 className={mktH2}>{plugin.title}</h2>
					<p className={LEAD}>{plugin.body}</p>
				</div>
				<ol className="mt-10 grid list-decimal gap-5 rounded-xl bg-surface py-6 pr-6 pl-12 leading-relaxed marker:font-semibold sm:py-8 sm:pr-8 sm:pl-14 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-start">
					{plugin.steps.map((step) => (
						<li key={step} className="pl-1">
							{step}
						</li>
					))}
				</ol>
				<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 self-start">
					<PluginDownload release={release} label={plugin.download} />
					<a
						href={docs.obsRemoteControl}
						target="_blank"
						rel="noreferrer"
						className={TEXT_LINK}
					>
						{plugin.docs}
					</a>
				</div>
			</section>

			<section>
				<h2 className={mktH2}>{page.situationsTitle}</h2>
				<div className="mt-10 md:mt-12">
					<SituationList items={page.situations} />
				</div>
			</section>

			<section>
				<h2 className={mktH2}>{studio.title}</h2>
				<ul className="mt-10 grid border-ink/15 border-t md:mt-12 md:grid-cols-2 md:gap-x-12">
					{studio.items.map((item) => (
						<li
							key={item}
							className="border-ink/15 border-b py-5 leading-relaxed"
						>
							{item}
						</li>
					))}
				</ul>
			</section>

			<section id="compare">
				<div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-x-12">
					<div>
						<h2 className={mktH2}>{cost.heading}</h2>
						<p className={LEAD}>{cost.body}</p>
					</div>
					<CostChart copy={cost} affiliateHref={`${base}/affiliate`} />
				</div>
				<div className="mt-16 md:mt-20">
					<ComparisonTable
						caption={cost.tableCaption}
						columns={comparisonProducts}
						rows={rows}
					/>
					<p className="mt-4 text-ink-muted text-sm">
						{cost.checked} {COMPARISON_CHECKED}.
					</p>
				</div>
			</section>

			<section>
				<StepList title={page.steps.title} items={page.steps.items} />
			</section>

			<section>
				<Faq copy={page.faq} />
			</section>
		</>
	);
}

/**
 * Links the release page on the server (phones have no OBS to install into);
 * after mount, the installer for the visitor's desktop platform when the
 * release has one.
 */
function PluginDownload({
	release,
	label,
}: {
	release: ObsPluginRelease | null;
	label: string;
}) {
	const fallback = release?.htmlUrl ?? legalEntity.releasesUrl;
	const [href, setHref] = useState(fallback);

	useEffect(() => {
		const platform = detectObsPluginPlatform(navigator.userAgent);
		const asset = release?.assets.find((a) => a.platform === platform);
		setHref(asset?.downloadUrl ?? fallback);
	}, [release, fallback]);

	return (
		<a
			href={href}
			className={`${mktButton} inline-flex h-12 items-center justify-center whitespace-nowrap px-8`}
		>
			{label}
		</a>
	);
}
