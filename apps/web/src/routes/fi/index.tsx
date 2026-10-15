import { createFileRoute } from "@tanstack/react-router";

import { landingHead } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { faqJsonLd, softwareAppJsonLd } from "@/lib/seo";
import { HomePage } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () =>
		landingHead(
			"fi",
			"/",
			landingCopy.fi.home.meta.title,
			landingCopy.fi.home.meta.description,
			[faqJsonLd("fi", landingCopy.fi.home.faq.items), softwareAppJsonLd("fi")],
		),
	component: () => <HomePage locale="fi" />,
});
