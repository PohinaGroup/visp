import { createFileRoute } from "@tanstack/react-router";

import { landingHead } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { faqFi, HomeComponent } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () =>
		landingHead(
			"fi",
			landingCopy.fi.meta.title,
			landingCopy.fi.meta.description,
			faqFi,
		),
	component: () => <HomeComponent locale="fi" />,
});
