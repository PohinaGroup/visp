import { cn } from "@VISP/ui/lib/utils";
import { type ReactNode, useEffect, useState } from "react";

import { TryCta } from "@/components/try-cta";
import type { Locale } from "@/lib/i18n";

import { mktButton } from "./styles";

/** Shown once the hero CTA has scrolled off the top and until the closing CTA scrolls in. */
export function stickyVisible(
	sentinel: { bottom: number } | null,
	end: { top: number } | null,
	viewportHeight: number,
) {
	if (!sentinel) return false;
	return sentinel.bottom <= 0 && (!end || end.top >= viewportHeight);
}

/** Phones only. z-40 keeps the cookie banner (z-50) on top of it. */
export function StickyCtaBar({
	visible,
	children,
}: {
	visible: boolean;
	children: ReactNode;
}) {
	return (
		<div
			aria-hidden={!visible}
			inert={!visible}
			className={cn(
				"mkt fixed inset-x-0 bottom-0 z-40 border-ink/15 border-t bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-[translate,visibility] duration-200 ease-out motion-reduce:transition-none md:hidden",
				!visible && "invisible translate-y-full",
			)}
		>
			<div className="h-12">{children}</div>
		</div>
	);
}

export function StickyCta({
	locale,
	sentinelId,
	endId,
}: {
	locale: Locale;
	sentinelId: string;
	endId: string;
}) {
	// Hidden on the server and until the observer reports.
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const sentinel = document.getElementById(sentinelId);
		if (!sentinel) return;
		const end = document.getElementById(endId);
		const update = () =>
			setVisible(
				stickyVisible(
					sentinel.getBoundingClientRect(),
					end?.getBoundingClientRect() ?? null,
					window.innerHeight,
				),
			);
		// Each root reaches far past one viewport edge, so its target crosses a
		// single boundary (sentinel bottom at 0, end top at the fold). A jump
		// straight over the viewport (anchor link, fling) still fires.
		const far = "100000px";
		const pastTop = new IntersectionObserver(update, {
			rootMargin: `0px 0px ${far} 0px`,
		});
		const reachedFold = new IntersectionObserver(update, {
			rootMargin: `${far} 0px 0px 0px`,
		});
		pastTop.observe(sentinel);
		if (end) reachedFold.observe(end);
		return () => {
			pastTop.disconnect();
			reachedFold.disconnect();
		};
	}, [sentinelId, endId]);

	// index.css lifts the Seppo bubble above the bar while this is set.
	useEffect(() => {
		if (!visible) return;
		document.body.dataset.stickyCta = "on";
		return () => {
			delete document.body.dataset.stickyCta;
		};
	}, [visible]);

	return (
		<StickyCtaBar visible={visible}>
			<TryCta
				locale={locale}
				size="lg"
				className={cn(mktButton, "h-full w-full")}
			/>
		</StickyCtaBar>
	);
}
