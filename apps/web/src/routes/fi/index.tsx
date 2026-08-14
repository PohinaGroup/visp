import { createFileRoute } from "@tanstack/react-router";

import { landingHead } from "@/lib/i18n";
import { faqFi, HomeComponent } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () =>
		landingHead(
			"fi",
			"VISP — Korvaa pilvi-OBS omalla striimaustietokoneellasi",
			"Lähetä puhelimen tai selaimen syöte omalla laitteistollasi pyörivään OBS:ään. Pidä kohtaukset, grafiikat ja hallinta ilman 120–180 dollarin kuukausittaista pilvi-OBS-tilausta.",
			faqFi,
		),
	component: () => <HomeComponent locale="fi" />,
});
