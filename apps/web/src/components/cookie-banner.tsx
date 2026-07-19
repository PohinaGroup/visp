import { Button } from "@VISP/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
	type CookieConsentChoice,
	readCookieConsent,
	writeCookieConsent,
} from "@/lib/cookie-consent";

export function CookieBanner() {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		setVisible(readCookieConsent() === null);
	}, []);

	const choose = (choice: CookieConsentChoice) => {
		writeCookieConsent(choice);
		setVisible(false);
	};

	if (!visible) {
		return null;
	}

	return (
		<div
			className="fixed inset-x-0 bottom-0 z-50 border-border border-t bg-background/95 p-4 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/85"
			role="dialog"
			aria-labelledby="cookie-banner-title"
			aria-describedby="cookie-banner-desc"
		>
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div className="flex max-w-xl flex-col gap-2">
					<p
						id="cookie-banner-title"
						className="font-display font-semibold text-sm uppercase tracking-wide"
					>
						Cookies on VISP
					</p>
					<p
						id="cookie-banner-desc"
						className="text-muted-foreground text-sm leading-relaxed"
					>
						We use essential cookies to keep you signed in and run the service.
						Optional cookies (for example analytics) are only used if you accept
						them. See our{" "}
						<Link className="text-foreground underline underline-offset-4" to="/cookies">
							Cookie Policy
						</Link>{" "}
						and{" "}
						<Link className="text-foreground underline underline-offset-4" to="/privacy">
							Privacy Policy
						</Link>
						.
					</p>
				</div>
				<div className="flex shrink-0 flex-wrap gap-2">
					<Button variant="outline" onClick={() => choose("necessary")}>
						Necessary only
					</Button>
					<Button onClick={() => choose("all")}>Accept all</Button>
				</div>
			</div>
		</div>
	);
}
