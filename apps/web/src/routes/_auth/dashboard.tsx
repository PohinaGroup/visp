import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard";

export const Route = createFileRoute("/_auth/dashboard")({
	beforeLoad: async ({ context, location }) => {
		const [status, paths] = await Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.secrets.status.queryOptions(),
			),
			context.queryClient.ensureQueryData(
				context.trpc.paths.list.queryOptions(),
			),
		]);
		if (!status.onboardedAt && !paths.some((path) => path.publishRevealable)) {
			throw redirect({
				to: "/setup",
				search: {
					lang:
						new URLSearchParams(location.searchStr).get("lang") === "fi"
							? "fi"
							: undefined,
					redo: false,
				},
			});
		}
	},
	component: DashboardPage,
});
