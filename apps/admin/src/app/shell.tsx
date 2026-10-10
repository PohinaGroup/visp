import { Button } from "@VISP/ui/components/button";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LogOut, Menu, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { authClient } from "../lib";
import { findNavItem, NAV_GROUPS, NAV_ITEMS } from "./nav";
import { useAdminSession } from "./session";

/** Grouped nav links; the same list serves the sidebar and the narrow menu. */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
	return (
		<div className="grid gap-5">
			{NAV_GROUPS.map((group) => (
				<div className="grid gap-1" key={group}>
					<p className="px-3 pb-1 font-medium text-[0.7rem] text-muted-foreground uppercase tracking-wider">
						{group}
					</p>
					{NAV_ITEMS.filter((item) => item.group === group).map((item) => (
						<Link
							activeOptions={{
								exact: item.path === "/",
								includeSearch: false,
							}}
							className="flex items-center gap-2.5 px-3 py-2 text-muted-foreground text-sm transition-colors hover:bg-accent/60 hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
							key={item.path}
							to={item.path}
							onClick={onNavigate}
						>
							<item.icon className="size-4 shrink-0" />
							{item.label}
						</Link>
					))}
				</div>
			))}
		</div>
	);
}

/**
 * Persistent admin chrome: sticky header with identity and global actions, a
 * left nav on wide screens that becomes a toggled top menu on narrow ones,
 * and the routed page in the remaining space.
 */
export function Shell() {
	const session = useAdminSession();
	const queryClient = useQueryClient();
	const [menuOpen, setMenuOpen] = useState(false);
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});

	useEffect(() => {
		const page = findNavItem(pathname);
		document.title = page ? `${page.label} · VISP Admin` : "VISP Admin";
	}, [pathname]);

	const refresh = async () => {
		await queryClient.invalidateQueries();
	};

	return (
		<div className="min-h-screen">
			<header className="sticky top-0 z-20 border-border/70 border-b bg-background/90 backdrop-blur">
				<div className="mx-auto flex h-14 max-w-[1800px] items-center justify-between px-4 lg:px-6">
					<div className="flex items-center gap-3">
						<Button
							aria-controls="admin-mobile-nav"
							aria-expanded={menuOpen}
							className="lg:hidden"
							size="icon"
							title={menuOpen ? "Close menu" : "Open menu"}
							variant="ghost"
							onClick={() => setMenuOpen((open) => !open)}
						>
							{menuOpen ? <X /> : <Menu />}
						</Button>
						<Link className="flex items-center gap-3" to="/">
							<div className="flex size-8 items-center justify-center bg-primary text-primary-foreground">
								<ShieldCheck className="size-4" />
							</div>
							<div>
								<p className="font-semibold leading-none">VISP Admin</p>
								<p className="mt-1 text-muted-foreground text-xs">
									Support console
								</p>
							</div>
						</Link>
					</div>
					<div className="flex items-center gap-2">
						<div className="hidden text-right sm:block">
							<p className="text-xs">{session.user.name}</p>
							<p className="text-muted-foreground text-xs">
								{session.user.email}
							</p>
						</div>
						<Button
							size="icon"
							title="Refresh"
							variant="ghost"
							onClick={refresh}
						>
							<RefreshCw />
						</Button>
						<Button
							size="icon"
							title="Sign out"
							variant="ghost"
							onClick={async () => {
								await authClient.signOut();
								window.location.reload();
							}}
						>
							<LogOut />
						</Button>
					</div>
				</div>
				{menuOpen && (
					<nav
						aria-label="Admin pages"
						className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-border/70 border-t px-2 py-4 lg:hidden"
						id="admin-mobile-nav"
					>
						<NavLinks onNavigate={() => setMenuOpen(false)} />
					</nav>
				)}
			</header>

			<div className="mx-auto flex max-w-[1800px]">
				<aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 overflow-y-auto border-border/70 border-r px-2 py-6 lg:block">
					<nav aria-label="Admin pages">
						<NavLinks />
					</nav>
				</aside>
				<main className="min-w-0 flex-1 p-4 lg:p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
