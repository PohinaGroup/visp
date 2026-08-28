import { createFileRoute } from "@tanstack/react-router";
import { StudioPage } from "@/components/studio";

export const Route = createFileRoute("/_auth/studio")({
	beforeLoad: ({ context }) =>
		context.queryClient.ensureQueryData(context.trpc.studio.get.queryOptions()),
	component: StudioPage,
});
