import { Button } from "@VISP/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { LegalDoc } from "@/components/legal-doc";
import {
	type CookieConsent,
	type CookieConsentChoice,
	readCookieConsent,
	writeCookieConsent,
} from "@/lib/cookie-consent";
import { legalEntity } from "@/lib/legal";
import { localizedHead } from "@/lib/i18n";

export const Route = createFileRoute("/cookies")({
	head: () => ({
		meta: [
			{ title: "Cookie Policy — VISP" },
			{
				name: "description",
				content: "How VISP uses cookies and similar technologies.",
			},
		],
		links: localizedHead("en", "/cookies"),
	}),
	component: CookiesPage,
});

function CookiesPage() {
	const [consent, setConsent] = useState<CookieConsent | null>(null);

	useEffect(() => {
		setConsent(readCookieConsent());
		const onChange = (event: Event) => {
			const detail = (event as CustomEvent<CookieConsent>).detail;
			setConsent(detail);
		};
		window.addEventListener("visp:cookie-consent", onChange);
		return () => window.removeEventListener("visp:cookie-consent", onChange);
	}, []);

	const choose = (choice: CookieConsentChoice) => {
		setConsent(writeCookieConsent(choice));
	};

	return (
		<LegalDoc
			eyebrow="Legal"
			title="Cookie Policy"
			description="This policy explains how VISP uses cookies and similar technologies on the website and web app."
			updated="19 July 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>1. Who we are</h2>
				<p>
					Cookies are used by <strong>{legalEntity.companyName}</strong>{" "}
					(Business ID {legalEntity.businessId}) in connection with VISP.
					Contact:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>2. What cookies are</h2>
				<p>
					Cookies are small text files stored on your device. Similar
					technologies include local storage. Some are essential for the service
					to work; others are optional and used only with your consent.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>3. Essential cookies</h2>
				<p>
					These are required to provide the service you request and cannot be
					switched off in our systems:
				</p>
				<ul>
					<li>
						<strong>Authentication / session cookies</strong> — keep you signed
						in securely (httpOnly session cookies set by our auth stack).
					</li>
					<li>
						<strong>Security cookies</strong> — help protect accounts and
						requests (for example CSRF / session integrity where applicable).
					</li>
				</ul>
				<p>
					Essential cookies are processed on the basis of our legitimate
					interest / necessity to provide the service (ePrivacy / GDPR).
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>4. Analytics (cookieless)</h2>
				<p>
					When configured, VISP loads{" "}
					<a
						href="https://rybbit.com"
						rel="noopener noreferrer"
						target="_blank"
					>
						Rybbit
					</a>{" "}
					for privacy-oriented product analytics (page views, basic usage
					metrics). Rybbit is designed to operate without cookies or local
					storage for tracking, so it is not gated by the optional-cookie choice
					below. Sensitive values shown in the dashboard (for example publish
					URLs) are excluded from session replay where that feature is enabled.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>5. Optional cookies</h2>
				<p>
					Optional cookies are used only if you choose{" "}
					<strong>Accept all</strong>. VISP does not currently set additional
					optional cookies beyond remembering this preference.
				</p>
				<p>
					Your choice is stored in local storage under{" "}
					<code className="text-foreground">visp.cookie-consent</code> so we can
					remember it.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>6. Manage your choice</h2>
				<p>
					Current preference:{" "}
					<strong>
						{consent
							? consent.choice === "all"
								? "Accept all"
								: "Necessary only"
							: "Not set"}
					</strong>
					{consent ? ` (saved ${new Date(consent.updatedAt).toLocaleString()})` : ""}.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => choose("necessary")}>
						Necessary only
					</Button>
					<Button onClick={() => choose("all")}>Accept all</Button>
				</div>
			</section>

			<section className="flex flex-col gap-3">
				<h2>7. More information</h2>
				<p>
					See the <Link to="/privacy">Privacy Policy</Link> for broader data
					processing details, or <Link to="/contact">Contact</Link> us at{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>
		</LegalDoc>
	);
}
