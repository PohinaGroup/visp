import { cn } from "@VISP/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { localeSearch, otherLocaleHref, useLocale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { legalEntity } from "@/lib/legal";
import { isForcedDarkPath } from "@/lib/theme";
import { useTRPC } from "@/utils/trpc";
import { MobileMenu, menuRow } from "./marketing/mobile-menu";
import { mktButton } from "./marketing/styles";
import { ThemeToggle } from "./marketing/theme-toggle";
import { MeterMark } from "./meter-mark";
import { TryCta } from "./try-cta";
import UserMenu from "./user-menu";

// One header for every page. `landing` switches to the marketing tokens and
// swaps the signed-out action from "Sign In" to the try-free CTA. The inline
// nav starts at lg (xl when signed in, for the Dashboard link and user menu):
// Finnish labels, theme toggle, and the action don't fit any narrower. Cloud
// Studio sits in the user menu and the sheet, never inline.
export default function Header({ landing = false }: { landing?: boolean }) {
	const locale = useLocale();
	const fi = locale === "fi";
	const nav = landingCopy[locale].shared.nav;
	const search = localeSearch(locale);
	const localeHref = useLocation({
		select: (location) =>
			otherLocaleHref(location.pathname, location.searchStr),
	});
	const showTheme = !useLocation({
		select: (location) => isForcedDarkPath(location.pathname),
	});
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();
	const studio = useQuery({
		...trpc.studio.mode.get.queryOptions(),
		enabled: Boolean(session),
	});
	const link = cn(
		"inline-flex h-11 shrink-0 items-center whitespace-nowrap transition-colors",
		landing
			? "font-medium text-ink-muted hover:text-ink"
			: "text-muted-foreground hover:text-foreground",
	);

	return (
		<header
			className={
				landing ? "mkt border-ink/15 border-b" : "border-border border-b"
			}
		>
			<div
				className={cn(
					"mx-auto flex h-[4.5rem] items-center justify-between gap-3 px-4 sm:px-6",
					landing ? "max-w-[1200px]" : "max-w-[1100px]",
				)}
			>
				<Link
					to={fi ? "/fi" : "/"}
					activeOptions={{ exact: true }}
					className="-ml-1 flex min-h-11 shrink-0 items-center gap-3 px-1"
				>
					<span className="font-bold font-display text-xl uppercase leading-none tracking-[0.28em]">
						VISP
					</span>
					<MeterMark className={landing ? "[&>span]:bg-ink" : undefined} />
				</Link>
				<nav
					aria-label={nav.label}
					className={cn(
						"hidden items-center gap-6",
						session ? "xl:flex" : "lg:flex",
						landing ? "text-[0.9375rem]" : "text-sm",
					)}
				>
					<Link to={fi ? "/fi/phone-only" : "/phone-only"} className={link}>
						{nav.phoneOnly}
					</Link>
					<Link to={fi ? "/fi/with-obs" : "/with-obs"} className={link}>
						{nav.withObs}
					</Link>
					<a
						href={fi ? `${legalEntity.docsUrl}/fi` : legalEntity.docsUrl}
						target="_blank"
						rel="noreferrer"
						className={link}
					>
						{nav.docs}
					</a>
					<Link to={fi ? "/fi/blog" : "/blog"} className={link}>
						{nav.blog}
					</Link>
					<a
						href={legalEntity.discordUrl}
						target="_blank"
						rel="noreferrer"
						className={link}
					>
						Discord
					</a>
					{session ? (
						<Link to="/dashboard" search={search} className={link}>
							{nav.dashboard}
						</Link>
					) : null}
					<a
						href={localeHref}
						hrefLang={fi ? "en" : "fi"}
						lang={fi ? "en" : "fi"}
						className={link}
					>
						{fi ? "EN" : "FI"}
					</a>
				</nav>
				<div className="flex min-w-0 items-center gap-2 lg:gap-4">
					{showTheme ? (
						<ThemeToggle
							variant="icons"
							className={cn("hidden", session ? "xl:flex" : "lg:flex")}
						/>
					) : null}
					{landing && !session ? (
						<TryCta
							locale={locale}
							className={cn(mktButton, "h-11 px-4 text-[0.9375rem]")}
						/>
					) : (
						<UserMenu
							studioLabel={studio.data?.available ? nav.cloudStudio : undefined}
						/>
					)}
					<MobileMenu
						locale={locale}
						landing={landing}
						showTheme={showTheme}
						triggerClassName={session ? "xl:hidden" : "lg:hidden"}
					>
						{session ? (
							<li>
								<Link to="/dashboard" search={search} className={menuRow}>
									{nav.dashboard}
								</Link>
							</li>
						) : null}
						{studio.data?.available ? (
							<li>
								<Link to="/studio" search={search} className={menuRow}>
									{nav.cloudStudio}
								</Link>
							</li>
						) : null}
					</MobileMenu>
				</div>
			</div>
		</header>
	);
}
