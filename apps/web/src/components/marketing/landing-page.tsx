import { type ReactNode, useState } from "react";

import Header from "@/components/header";
import { SeppoWidget } from "@/components/seppo-widget";
import { TryCta } from "@/components/try-cta";
import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";

import { MarketingFooter } from "./marketing-footer";
import { StickyCta } from "./sticky-cta";
import { mktButton, mktH2 } from "./styles";

/**
 * The chrome every lander page shares: header, hero (H1, body, the try-free
 * CTA, media), the page's sections, the closing CTA, footer, sticky CTA, and
 * Seppo. The sticky bar shows between `#hero-cta` and `#closing`.
 * `secondary` sits next to both CTAs; `topNote` sits above the hero.
 */
export function LandingPage({
	locale,
	hero,
	media,
	secondary,
	topNote,
	closing,
	children,
}: {
	locale: Locale;
	hero: { title: string; body: string };
	media: ReactNode;
	secondary?: ReactNode;
	topNote?: ReactNode;
	closing: { title: string; body: string };
	children: ReactNode;
}) {
	const [seppoOpen, setSeppoOpen] = useState(false);
	const { seppo } = landingCopy[locale].shared;
	const tryCta = <TryCta locale={locale} size="lg" className={mktButton} />;
	const cta = secondary ? (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
			{tryCta}
			{secondary}
		</div>
	) : (
		tryCta
	);

	return (
		<>
			<Header landing />
			<main className="mkt">
				<div className="mx-auto flex max-w-[1200px] flex-col gap-24 px-4 pb-24 sm:px-6 md:gap-32 md:pb-32">
					<section className="grid gap-10 pt-8 md:pt-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-16">
						{topNote ? (
							// Pulled closer to the H1 on phones so the hero CTA stays in the first screen.
							<div className="-mb-4 lg:col-span-2 lg:mb-0">{topNote}</div>
						) : null}
						<div>
							<h1 className="mkt-display text-[clamp(2.5rem,7vw,5.5rem)]">
								{hero.title}
							</h1>
							<p className="mt-5 max-w-[56ch] text-[1.0625rem] leading-relaxed md:mt-7 md:text-[1.1875rem]">
								{hero.body}
							</p>
							<div id="hero-cta" className="mt-7 md:mt-9">
								{cta}
							</div>
						</div>
						{media}
					</section>

					{children}

					<section id="closing">
						<h2 className={mktH2}>{closing.title}</h2>
						<p className="mt-5 max-w-[56ch] leading-relaxed">{closing.body}</p>
						<div className="mt-8">{cta}</div>
					</section>
				</div>
			</main>
			<MarketingFooter locale={locale} />
			<StickyCta locale={locale} sentinelId="hero-cta" endId="closing" />
			<SeppoWidget
				context="landing"
				open={seppoOpen}
				placeholder={seppo.placeholder}
				subtitle={seppo.subtitle}
				suggestions={seppo.suggestions}
				welcome={seppo.welcome}
				onOpenChange={setSeppoOpen}
			/>
		</>
	);
}
