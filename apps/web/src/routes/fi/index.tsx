import { createFileRoute } from "@tanstack/react-router";

import { localizedHead } from "@/lib/i18n";
import { HomeComponent } from "@/routes/index";

export const Route = createFileRoute("/fi/")({
	head: () => ({
		meta: [
			{ title: "VISP — suoratoisto ilman talutushihnaa" },
			{
				name: "description",
				content:
					"Käytä puhelimia OBS:n etäkameroina, pidä tuotanto kotona ja jatka lähetystä mobiiliverkon katkosten yli.",
			},
			{ property: "og:locale", content: "fi_FI" },
		],
		links: localizedHead("fi"),
	}),
	component: () => <HomeComponent locale="fi" />,
});
