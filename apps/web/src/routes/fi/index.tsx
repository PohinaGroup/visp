import { createFileRoute } from "@tanstack/react-router";

import { landingHead } from "@/lib/i18n";
import { HomeComponent } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () =>
		landingHead(
			"fi",
			"VISP — IRL-suoratoisto puhelimella tai OBS:llä Twitchiin ja YouTubeen",
			"VISP lähettää puhelimesta tai selaimesta suoraan Twitchiin, Kickiin tai YouTubeen. Lisää OBS, kun tarvitset valvontaa, tallennusta tai kohtauksia.",
		),
	component: () => <HomeComponent locale="fi" />,
});
