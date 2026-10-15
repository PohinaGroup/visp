import { createFileRoute } from "@tanstack/react-router";

import { getObsPluginRelease } from "@/functions/get-obs-releases";
import { WithObsPage, withObsHead } from "@/routes/with-obs";

export const Route = createFileRoute("/fi/with-obs")({
	loader: () => getObsPluginRelease(),
	head: () => withObsHead("fi"),
	component: () => <WithObsPage locale="fi" release={Route.useLoaderData()} />,
});
