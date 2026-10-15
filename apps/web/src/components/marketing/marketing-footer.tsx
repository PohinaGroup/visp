import { Link } from "@tanstack/react-router";

import { trackEvent } from "@/lib/analytics";
import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { legalEntity } from "@/lib/legal";

const LINK =
	"flex min-h-11 items-center text-ink-muted transition-colors hover:text-ink";

/** Two columns of 44px rows on phones, one wrapping line from sm up. */
export function MarketingFooter({ locale }: { locale: Locale }) {
	return (
		<footer className="mkt border-ink/15 border-t">
			<div className="mx-auto max-w-[1200px] px-4 pt-8 pb-10 sm:px-6">
				<ul className="grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap sm:gap-x-7">
					{landingCopy[locale].shared.footer.map((l) => (
						<li key={l.label}>
							{l.external ? (
								<a
									href={l.href}
									target="_blank"
									rel="noreferrer"
									className={LINK}
								>
									{l.label}
								</a>
							) : (
								<Link
									to={l.href}
									search={l.search}
									onClick={() =>
										l.href === "/download"
											? trackEvent("lander_cta", { action: "download", locale })
											: undefined
									}
									className={LINK}
								>
									{l.label}
								</Link>
							)}
						</li>
					))}
				</ul>
				<p className="mt-6 text-ink-muted text-sm">
					© 2026 VISP, {legalEntity.companyName}
				</p>
			</div>
		</footer>
	);
}
