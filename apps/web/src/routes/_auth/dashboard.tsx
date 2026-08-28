import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard";
import { shouldEnterStudio } from "@/lib/studio-model";

export const Route = createFileRoute("/_auth/dashboard")({
	beforeLoad: async ({ context, location }) => {
		const [status, paths, studio] = await Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.secrets.status.queryOptions(),
			),
			context.queryClient.ensureQueryData(
				context.trpc.paths.list.queryOptions(),
			),
			context.queryClient.ensureQueryData(
				context.trpc.studio.get.queryOptions(),
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
		if (shouldEnterStudio(studio.settings)) {
			throw redirect({
				to: "/studio",
				search: {
					lang:
						new URLSearchParams(location.searchStr).get("lang") === "fi"
							? "fi"
							: undefined,
				},
			});
		}
	},
	component: DashboardPage,
});
