import { Link } from "@tanstack/react-router";
import { localeSearch, useLocale } from "@/lib/i18n";
import { MeterMark } from "./meter-mark";
import UserMenu from "./user-menu";

export default function Header() {
	const locale = useLocale();
	const fi = locale === "fi";
	return (
		<header className="border-b">
			<div className="flex flex-row items-center justify-between px-4 py-3">
				<nav className="flex items-center gap-6 text-sm">
					<Link to={fi ? "/fi" : "/"} className="flex items-center gap-2.5">
						<span className="font-bold font-display text-base uppercase leading-none tracking-[0.3em]">
							VISP
						</span>
						<MeterMark />
					</Link>
					<Link
						to="/dashboard"
						search={localeSearch(locale)}
						className="text-muted-foreground hover:text-foreground"
					>
						{fi ? "Hallintapaneeli" : "Dashboard"}
					</Link>
					<Link
						to={fi ? "/fi/blog" : "/blog"}
						className="text-muted-foreground hover:text-foreground"
					>
						{fi ? "Blogi" : "Blog"}
					</Link>
				</nav>
				<div className="flex items-center gap-2">
					<Link
						to="."
						search={fi ? {} : { lang: "fi" }}
						className="text-muted-foreground text-sm hover:text-foreground"
					>
						{fi ? "EN" : "FI"}
					</Link>
					<UserMenu />
				</div>
			</div>
		</header>
	);
}
