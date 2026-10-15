import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import Header from "@/components/header";
import { HeroVideo } from "@/components/marketing/hero-video";
import { HomeSections } from "@/components/marketing/home-sections";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { StickyCta } from "@/components/marketing/sticky-cta";
import { mktButton, mktH2 } from "@/components/marketing/styles";
import { SeppoWidget } from "@/components/seppo-widget";
import { TryCta } from "@/components/try-cta";
import { trackEvent } from "@/lib/analytics";
import { type Locale, landingHead, localeSearch } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { faqJsonLd, softwareAppJsonLd } from "@/lib/seo";

export const Route = createFileRoute("/")({
	head: () =>
		landingHead(
			"en",
			"/",
			landingCopy.en.home.meta.title,
			landingCopy.en.home.meta.description,
			[faqJsonLd("en", landingCopy.en.home.faq.items), softwareAppJsonLd("en")],
		),
	component: () => <HomePage locale="en" />,
});

// The old single-page lander's sections now live on /with-obs.
const OLD_ANCHORS = new Set(["#compare", "#workflows"]);

export function HomePage({ locale }: { locale: Locale }) {
	const [seppoOpen, setSeppoOpen] = useState(false);
	const { home, shared } = landingCopy[locale];
	const base = locale === "fi" ? "/fi" : "";

	// Hashes never reach the server, so the redirect happens here.
	useEffect(() => {
		if (OLD_ANCHORS.has(window.location.hash))
			window.location.replace(`${base}/with-obs#compare`);
	}, [base]);

	const download = (
		<Link
			to="/download"
			search={localeSearch(locale)}
			onClick={() => trackEvent("lander_cta", { action: "download", locale })}
			className="inline-flex min-h-11 items-center font-semibold underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
		>
			{shared.downloadLink}
		</Link>
	);
	const cta = (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
			<TryCta locale={locale} size="lg" className={mktButton} />
			{download}
		</div>
	);

	return (
		<>
			<Header landing />
			<main className="mkt">
				<div className="mx-auto flex max-w-[1200px] flex-col gap-24 px-4 pb-24 sm:px-6 md:gap-32 md:pb-32">
					<section className="grid gap-10 pt-8 md:pt-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
						<div>
							<h1 className="mkt-display text-[clamp(2.5rem,7vw,5.5rem)]">
								{home.hero.title}
							</h1>
							<p className="mt-5 max-w-[56ch] text-[1.0625rem] leading-relaxed md:mt-7 md:text-[1.1875rem]">
								{home.hero.body}
							</p>
							<div id="hero-cta" className="mt-7 md:mt-9">
								{cta}
							</div>
						</div>
						<HeroVideo
							src="/marketing/go-live-loop.m4v"
							poster="/marketing/go-live-loop.jpg"
							label={home.hero.videoLabel}
						/>
					</section>

					<HomeSections locale={locale} />

					<section id="closing">
						<h2 className={mktH2}>{home.closing.title}</h2>
						<p className="mt-5 max-w-[56ch] leading-relaxed">
							{home.closing.body}
						</p>
						<div className="mt-8">{cta}</div>
					</section>
				</div>
			</main>
			<MarketingFooter locale={locale} />
			<StickyCta locale={locale} sentinelId="hero-cta" endId="closing" />
			<SeppoWidget
				context="landing"
				open={seppoOpen}
				placeholder={shared.seppo.placeholder}
				subtitle={shared.seppo.subtitle}
				suggestions={shared.seppo.suggestions}
				welcome={shared.seppo.welcome}
				onOpenChange={setSeppoOpen}
			/>
		</>
	);
}
