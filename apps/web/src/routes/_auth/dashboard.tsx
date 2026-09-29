import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardPage } from "@/components/dashboard";
import { shouldEnterStudio } from "@/lib/studio-model";

export const Route = createFileRoute("/_auth/dashboard")({
	beforeLoad: async ({ context, location }) => {
		const [status, paths, studio, direct] = await Promise.all([
			context.queryClient.ensureQueryData(
				context.trpc.secrets.status.queryOptions(),
			),
			context.queryClient.ensureQueryData(
				context.trpc.paths.list.queryOptions(),
			),
			context.queryClient.ensureQueryData(
				context.trpc.studio.get.queryOptions(),
			),
			// ponytail: status outage must not block the dashboard; the page shows it.
			context.queryClient
				.ensureQueryData(context.trpc.direct.list.queryOptions())
				.catch(() => null),
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
		// ponytail: one-shot per tab session, or Studio's Dashboard button loops back here.
		if (
			direct?.mode === "direct" &&
			shouldEnterStudio(studio.settings) &&
			!sessionStorage.getItem("visp:studio-entered")
		) {
			sessionStorage.setItem("visp:studio-entered", "1");
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
