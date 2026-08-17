import { createFileRoute } from "@tanstack/react-router";

import { AffiliatePage, affiliateHead } from "@/routes/affiliate";

export const Route = createFileRoute("/fi/affiliate")({
	head: () => affiliateHead("fi"),
	component: () => <AffiliatePage locale="fi" />,
});
