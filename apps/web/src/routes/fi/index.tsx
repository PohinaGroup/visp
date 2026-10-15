import { createFileRoute } from "@tanstack/react-router";

import { landingHead } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { HomePage } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () =>
		landingHead(
			"fi",
			landingCopy.fi.home.meta.title,
			landingCopy.fi.home.meta.description,
			landingCopy.fi.home.faq.items,
		),
	component: () => <HomePage locale="fi" />,
});
