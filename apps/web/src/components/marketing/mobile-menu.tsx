import { Link, useLocation } from "@tanstack/react-router";
import { LanguagesIcon, MenuIcon, XIcon } from "lucide-react";
import {
	type MouseEvent,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";

import { TryCta } from "@/components/try-cta";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { type Locale, localeSearch, otherLocaleHref } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { legalEntity } from "@/lib/legal";

import { mktButton } from "./styles";
import { ThemeToggle } from "./theme-toggle";

/** One large row in the menu sheet; header.tsx uses it for the signed-in extras. */
export const menuRow =
	"mkt-display flex min-h-14 items-center border-ink/12 border-b text-[1.5rem] leading-none";

const ICON_BUTTON =
	"inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-current/10";

/**
 * Phones and tablets: a menu button that opens a full-height sheet (native
 * <dialog>, so focus trap, Escape, and inert background come from the
 * browser). Navigation rows sit at the top; language, theme, and the CTA
 * sit at the bottom, under the thumb. `children` are extra rows (Dashboard,
 * Cloud Studio) rendered before the page links.
 */
export function MobileMenu({
	locale,
	landing = false,
	showTheme = true,
	triggerClassName = "lg:hidden",
	children,
}: {
	locale: Locale;
	landing?: boolean;
	showTheme?: boolean;
	/** Hides the menu button where the header's inline nav takes over. */
	triggerClassName?: string;
	children?: ReactNode;
}) {
	const nav = landingCopy[locale].shared.nav;
	const fi = locale === "fi";
	const id = useId();
	const dialog = useRef<HTMLDialogElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const [open, setOpen] = useState(false);
	const { data: session } = authClient.useSession();
	const localeHref = useLocation({
		select: (location) =>
			otherLocaleHref(location.pathname, location.searchStr),
	});

	// Backdrop (the dialog box itself, outside the sheet) and any link or CTA close it.
	function onSheetClick(event: MouseEvent<HTMLDialogElement>) {
		const target = event.target as Element;
		if (
			target === event.currentTarget ||
			target.closest("a, [data-menu-close]")
		)
			dialog.current?.close();
	}

	return (
		<>
			<button
				ref={trigger}
				type="button"
				aria-label={nav.menu}
				aria-haspopup="dialog"
				aria-expanded={open}
				aria-controls={id}
				onClick={() => {
					dialog.current?.showModal();
					setOpen(true);
				}}
				className={`${ICON_BUTTON} -mr-2.5 ${triggerClassName}`}
			>
				<MenuIcon aria-hidden className="size-6" />
			</button>
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated clicks from links and buttons; Escape is native to <dialog> */}
			<dialog
				ref={dialog}
				id={id}
				aria-label={nav.menu}
				onClick={onSheetClick}
				onClose={() => {
					setOpen(false);
					trigger.current?.focus();
				}}
				className="mkt mkt-menu fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 p-0 sm:max-w-sm sm:border-ink/15 sm:border-l"
			>
				<div className="flex h-full flex-col">
					<div className="flex h-[4.5rem] shrink-0 items-center justify-end px-4 sm:px-6">
						<button
							type="button"
							aria-label={nav.close}
							data-menu-close
							className={`${ICON_BUTTON} -mr-2.5`}
						>
							<XIcon aria-hidden className="size-6" />
						</button>
					</div>
					<nav
						aria-label={nav.menu}
						className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6"
					>
						<ul className="border-ink/12 border-t">
							{children}
							<li>
								<Link
									to={fi ? "/fi/phone-only" : "/phone-only"}
									className={menuRow}
								>
									{nav.phoneOnly}
								</Link>
							</li>
							<li>
								<a href={fi ? "/fi/with-obs" : "/with-obs"} className={menuRow}>
									{nav.withObs}
								</a>
							</li>
							<li>
								<Link
									to="/download"
									search={localeSearch(locale)}
									onClick={() =>
										landing
											? trackEvent("lander_cta", { action: "download", locale })
											: undefined
									}
									className={menuRow}
								>
									{nav.download}
								</Link>
							</li>
							<li>
								<a
									href={fi ? `${legalEntity.docsUrl}/fi` : legalEntity.docsUrl}
									target="_blank"
									rel="noreferrer"
									className={menuRow}
								>
									{nav.docs}
								</a>
							</li>
							<li>
								<Link to={fi ? "/fi/blog" : "/blog"} className={menuRow}>
									{nav.blog}
								</Link>
							</li>
						</ul>
					</nav>
					<div className="flex shrink-0 flex-col gap-3 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
						<a
							href={localeHref}
							hrefLang={fi ? "en" : "fi"}
							lang={fi ? "en" : "fi"}
							className="flex min-h-14 items-center gap-3 border-ink/12 border-b font-semibold text-lg"
						>
							<LanguagesIcon aria-hidden className="size-5 text-ink-muted" />
							{fi ? "English" : "Suomi"}
						</a>
						{showTheme ? (
							<div className="flex flex-col gap-2">
								<span className="text-ink-muted text-sm">
									{nav.theme.label}
								</span>
								<ThemeToggle />
							</div>
						) : null}
						{session ? null : (
							<div data-menu-close>
								<TryCta
									locale={locale}
									size="lg"
									className={`${mktButton} w-full`}
								/>
							</div>
						)}
					</div>
				</div>
			</dialog>
		</>
	);
}
