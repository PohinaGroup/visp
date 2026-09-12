import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AuthAnalytics } from "@/components/auth-analytics";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth")({
	ssr: false,
	component: AuthLayout,
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		// ponytail: ssr:false means the server shipped this route's pending fallback;
		// a soft redirect would hydrate /login over it and blow up hydration.
		if (!session.data) {
			throw redirect({
				to: "/login",
				search:
					new URLSearchParams(location.searchStr).get("lang") === "fi"
						? { lang: "fi" }
						: {},
				reloadDocument: true,
			});
		}
		return { session };
	},
});

function AuthLayout() {
	return (
		<>
			<AuthAnalytics />
			<Outlet />
		</>
	);
}
