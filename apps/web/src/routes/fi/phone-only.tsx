import { createFileRoute } from "@tanstack/react-router";

import { PhoneOnlyPage, phoneOnlyHead } from "@/routes/phone-only";

export const Route = createFileRoute("/fi/phone-only")({
	head: () => phoneOnlyHead("fi"),
	component: () => <PhoneOnlyPage locale="fi" />,
});
