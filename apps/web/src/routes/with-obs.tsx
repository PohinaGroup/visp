import { createFileRoute } from "@tanstack/react-router";
import { HeroVideo } from "@/components/marketing/hero-video";
import { LandingPage } from "@/components/marketing/landing-page";
import {
	WithObsNote,
	WithObsSections,
} from "@/components/marketing/with-obs-sections";
import { getObsPluginRelease } from "@/functions/get-obs-releases";
import { type Locale, landingHead } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import type { ObsPluginRelease } from "@/lib/obs-releases";
import { faqJsonLd, howToJsonLd } from "@/lib/seo";

export function withObsHead(locale: Locale) {
	const { meta, faq, steps } = landingCopy[locale].withObs;
	return landingHead(locale, "/with-obs", meta.title, meta.description, [
		faqJsonLd(locale, faq.items),
		howToJsonLd(locale, steps.title, steps.items),
	]);
}

export const Route = createFileRoute("/with-obs")({
	loader: () => getObsPluginRelease(),
	head: () => withObsHead("en"),
	component: () => <WithObsPage locale="en" release={Route.useLoaderData()} />,
});

export function WithObsPage({
	locale,
	release,
}: {
	locale: Locale;
	release: ObsPluginRelease | null;
}) {
	const { withObs, shared } = landingCopy[locale];

	return (
		<LandingPage
			locale={locale}
			topNote={<WithObsNote locale={locale} />}
			hero={withObs.hero}
			media={
				<HeroVideo
					src="/marketing/go-live-loop.m4v"
					poster="/marketing/go-live-loop.jpg"
					label={withObs.hero.videoLabel}
					buttons={shared.video}
				/>
			}
			closing={withObs.closing}
		>
			<WithObsSections locale={locale} release={release} />
		</LandingPage>
	);
}
