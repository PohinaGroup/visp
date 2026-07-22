import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	ssr: false,
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
				search:
					new URLSearchParams(location.searchStr).get("lang") === "fi"
						? { lang: "fi" }
						: {},
			});
		}
		return { session };
	},
});

function AuthLayout() {
	return <Outlet />;
}
