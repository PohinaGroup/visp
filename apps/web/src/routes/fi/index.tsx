import { createFileRoute } from "@tanstack/react-router";

import { landingHead } from "@/lib/i18n";
import { faqFi, HomeComponent } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () =>
		landingHead(
			"fi",
			"VISP — Luotettava IRL-striimaus puhelimesta",
			"Striimaa puhelimesta suoraan Twitchiin, Kickiin tai YouTubeen tai reititä kuva turvallisesti oman kotikoneesi OBS:ään. VISP on betan ajan ilmainen.",
			faqFi,
		),
	component: () => <HomeComponent locale="fi" />,
});
