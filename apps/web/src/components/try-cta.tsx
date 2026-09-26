import { useNavigate } from "@tanstack/react-router";

import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { type Locale, localeSearch } from "@/lib/i18n";

export function TryCta({
	locale,
	size = "sm",
}: {
	locale: Locale;
	size?: "sm" | "lg";
}) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const lg = size === "lg";
	return (
		<button
			type="button"
			onClick={() => {
				trackEvent("lander_cta", { action: "try_free", locale });
				return session
					? navigate({ to: "/dashboard", search: localeSearch(locale) })
					: navigate({ to: "/login", search: localeSearch(locale) });
			}}
			className={`inline-flex items-center whitespace-nowrap justify-center rounded-[var(--radius)] bg-primary font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
				lg ? "h-12 px-8 text-base" : "h-9 px-4 text-sm"
			}`}
		>
			{locale === "fi" ? "Kokeile VISPiä ilmaiseksi" : "Try VISP free"}
		</button>
	);
}
