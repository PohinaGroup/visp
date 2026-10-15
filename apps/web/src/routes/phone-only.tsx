import { createFileRoute } from "@tanstack/react-router";

import { LandingPage } from "@/components/marketing/landing-page";
import { PhoneOnlySections } from "@/components/marketing/phone-only-sections";
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
	const { phoneOnly } = landingCopy[locale];

	return (
		<LandingPage
			locale={locale}
			hero={phoneOnly.hero}
			media={
				<img
					src="/marketing/app-live.jpg"
					alt={phoneOnly.hero.imageAlt}
					width={IMAGE_WIDTH}
					height={IMAGE_HEIGHT}
					fetchPriority="high"
					className="h-auto max-h-[60svh] w-auto max-w-full rounded-xl bg-surface"
				/>
			}
			closing={phoneOnly.closing}
		>
			<PhoneOnlySections locale={locale} />
		</LandingPage>
	);
}
