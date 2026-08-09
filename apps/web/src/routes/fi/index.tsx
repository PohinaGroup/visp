import { createFileRoute } from "@tanstack/react-router";

import { landingHead } from "@/lib/i18n";
import { faqFi, HomeComponent } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () =>
		landingHead(
			"fi",
			"VISP — IRL-suoratoisto puhelimella tai OBS:llä Twitchiin ja YouTubeen",
			"VISP lähettää puhelimesta tai selaimesta suoraan Twitchiin, Kickiin tai YouTubeen ilman kotona pyörivää konetta. Betan ajan ilmainen, kun pilvipalvelut maksavat 120–180 $ kuukaudessa.",
			faqFi,
		),
	component: () => <HomeComponent locale="fi" />,
});
