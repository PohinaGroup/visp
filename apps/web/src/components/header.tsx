import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { localeSearch, otherLocaleHref, useLocale } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";
import { useTRPC } from "@/utils/trpc";
import { MeterMark } from "./meter-mark";
import { TryCta } from "./try-cta";
import UserMenu from "./user-menu";

const LINK = "text-muted-foreground transition-colors hover:text-foreground";

// One nav for every page. `landing` only swaps the signed-out action from
// "Sign In" to the lander's try-free CTA.
export default function Header({ landing = false }: { landing?: boolean }) {
	const locale = useLocale();
	const fi = locale === "fi";
	const search = localeSearch(locale);
	const localeHref = useLocation({
		select: (location) =>
			otherLocaleHref(location.pathname, location.searchStr),
	});
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();
	const studio = useQuery({
		...trpc.studio.mode.get.queryOptions(),
		enabled: Boolean(session),
	});
	return (
		<header className="border-border border-b">
			<div className="mx-auto flex h-[4.5rem] max-w-[1100px] items-center justify-between gap-4 px-6">
				<Link to={fi ? "/fi" : "/"} className="flex items-center gap-3">
					<span className="font-bold font-display text-xl uppercase leading-none tracking-[0.28em]">
						VISP
					</span>
					<MeterMark />
				</Link>
				<nav className="flex items-center gap-4 text-sm sm:gap-7">
					{session ? (
						<Link to="/dashboard" search={search} className={LINK}>
							{fi ? "Hallintapaneeli" : "Dashboard"}
						</Link>
					) : null}
					{studio.data?.available ? (
						<Link
							to="/studio"
							search={search}
							className={`hidden sm:inline ${LINK}`}
						>
							Cloud Studio
						</Link>
					) : null}
					<Link
						to="/download"
						search={search}
						onClick={() =>
							landing
								? trackEvent("lander_cta", { action: "download", locale })
								: undefined
						}
						// Phones keep room for the action; the lander hero and dashboard link to download.
						className={session || landing ? `hidden sm:inline ${LINK}` : LINK}
					>
						{fi ? "Lataa" : "Download"}
					</Link>
					<a
						href={fi ? `${legalEntity.docsUrl}/fi` : legalEntity.docsUrl}
						target="_blank"
						rel="noreferrer"
						className={`hidden sm:inline ${LINK}`}
					>
						{fi ? "Ohjeet" : "Docs"}
					</a>
					<Link
						to={fi ? "/fi/blog" : "/blog"}
						className={`hidden sm:inline ${LINK}`}
					>
						{fi ? "Blogi" : "Blog"}
					</Link>
					<a href={localeHref} hrefLang={fi ? "en" : "fi"} className={LINK}>
						{fi ? "EN" : "FI"}
					</a>
					{landing && !session ? <TryCta locale={locale} /> : <UserMenu />}
				</nav>
			</div>
		</header>
	);
}
