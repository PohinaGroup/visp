import { createFileRoute } from "@tanstack/react-router";

import Header from "@/components/header";
import { TryCta } from "@/components/try-cta";
import { type Locale, landingHead } from "@/lib/i18n";
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

// ponytail: a stub that keeps the tree compiling while the copy is restructured;
// the full home page replaces it.
export function HomePage({ locale }: { locale: Locale }) {
	const { hero } = landingCopy[locale].home;
	return (
		<>
			<Header landing />
			<main className="mkt min-h-screen px-4 py-16 sm:px-6">
				<h1 className="mkt-display max-w-[1200px] text-5xl">{hero.title}</h1>
				<p className="mt-6 max-w-[70ch]">{hero.body}</p>
				<p className="mt-8">
					<TryCta locale={locale} size="lg" />
				</p>
			</main>
		</>
	);
}
