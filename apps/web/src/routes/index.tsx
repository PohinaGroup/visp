import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";

import { HeroVideo } from "@/components/marketing/hero-video";
import { HomeSections } from "@/components/marketing/home-sections";
import { LandingPage } from "@/components/marketing/landing-page";
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
	const { home, shared } = landingCopy[locale];
	const base = locale === "fi" ? "/fi" : "";

	// Hashes never reach the server, so the redirect happens here.
	useEffect(() => {
		if (OLD_ANCHORS.has(window.location.hash))
			window.location.replace(`${base}/with-obs#compare`);
	}, [base]);

	return (
		<LandingPage
			locale={locale}
			hero={home.hero}
			media={
				<HeroVideo
					src="/marketing/go-live-loop.m4v"
					poster="/marketing/go-live-loop.jpg"
					label={home.hero.videoLabel}
				/>
			}
			secondary={
				<Link
					to="/download"
					search={localeSearch(locale)}
					onClick={() =>
						trackEvent("lander_cta", { action: "download", locale })
					}
					className="inline-flex min-h-11 items-center font-semibold underline decoration-ink/30 underline-offset-4 hover:decoration-ink"
				>
					{shared.downloadLink}
				</Link>
			}
			closing={home.closing}
		>
			<HomeSections locale={locale} />
		</LandingPage>
	);
}
