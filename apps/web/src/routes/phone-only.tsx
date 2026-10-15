import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import Header from "@/components/header";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { PhoneOnlySections } from "@/components/marketing/phone-only-sections";
import { StickyCta } from "@/components/marketing/sticky-cta";
import { mktButton, mktH2 } from "@/components/marketing/styles";
import { SeppoWidget } from "@/components/seppo-widget";
import { TryCta } from "@/components/try-cta";
import { type Locale, landingHead } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { faqJsonLd, howToJsonLd } from "@/lib/seo";

// app-live.jpg's pixel size; keeps the layout from shifting.
const IMAGE_WIDTH = 258;
const IMAGE_HEIGHT = 560;

export function phoneOnlyHead(locale: Locale) {
	const { meta, faq, steps } = landingCopy[locale].phoneOnly;
	return landingHead(locale, "/phone-only", meta.title, meta.description, [
		faqJsonLd(locale, faq.items),
		howToJsonLd(locale, steps.title, steps.items),
	]);
}

export const Route = createFileRoute("/phone-only")({
	head: () => phoneOnlyHead("en"),
	component: () => <PhoneOnlyPage locale="en" />,
});

export function PhoneOnlyPage({ locale }: { locale: Locale }) {
	const [seppoOpen, setSeppoOpen] = useState(false);
	const { phoneOnly, shared } = landingCopy[locale];
	const cta = <TryCta locale={locale} size="lg" className={mktButton} />;

	return (
		<>
			<Header landing />
			<main className="mkt">
				<div className="mx-auto flex max-w-[1200px] flex-col gap-24 px-4 pb-24 sm:px-6 md:gap-32 md:pb-32">
					<section className="grid gap-10 pt-8 md:pt-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
						<div>
							<h1 className="mkt-display text-[clamp(2.5rem,7vw,5.5rem)]">
								{phoneOnly.hero.title}
							</h1>
							<p className="mt-5 max-w-[56ch] text-[1.0625rem] leading-relaxed md:mt-7 md:text-[1.1875rem]">
								{phoneOnly.hero.body}
							</p>
							<div id="hero-cta" className="mt-7 md:mt-9">
								{cta}
							</div>
						</div>
						<img
							src="/marketing/app-live.jpg"
							alt={phoneOnly.hero.imageAlt}
							width={IMAGE_WIDTH}
							height={IMAGE_HEIGHT}
							fetchPriority="high"
							className="h-auto max-h-[60svh] w-auto max-w-full rounded-xl bg-surface"
						/>
					</section>

					<PhoneOnlySections locale={locale} />

					<section id="closing">
						<h2 className={mktH2}>{phoneOnly.closing.title}</h2>
						<p className="mt-5 max-w-[56ch] leading-relaxed">
							{phoneOnly.closing.body}
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
