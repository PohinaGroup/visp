import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { EYEBROW, PageHeader } from "@/components/page-header";
import { authClient, authRedirectURL } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		error: z.string().optional(),
		lang: z.literal("fi").optional(),
		redirect: z.string().optional(),
	}),
	component: RouteComponent,
});

function safeReturnPath(value: string | undefined) {
	return value?.startsWith("/") && !value.startsWith("//") ? value : "/setup";
}

const en = {
	eyebrow: "Sign in",
	title: "Sign in to VISP",
	subtitle:
		"Twitch, Kick, or Google identifies your relay account. Signing in never asks for your stream key.",
	notLinked:
		"That account matches an existing VISP account. Sign in with the provider you first used, then connect this one from the dashboard.",
	twitch: "Continue with Twitch",
	twitchPending: "Opening Twitch...",
	kick: "Continue with Kick",
	kickPending: "Opening Kick...",
	google: "Continue with Google",
	googlePending: "Opening Google...",
	agreeBefore: "By continuing, you agree to the ",
	terms: "Terms of Service",
	agreeAnd: " and ",
	privacy: "Privacy Policy",
	assurances: [
		{ tag: "KEY", body: "No stream key pasting — VISP fetches it over OAuth." },
		{ tag: "OBS", body: "Your feeds stay on your own OBS machine." },
		{ tag: "OAUTH", body: "Revoke access from the dashboard at any time." },
	],
};

const fiCopy: typeof en = {
	eyebrow: "Kirjautuminen",
	title: "Kirjaudu VISPiin",
	subtitle:
		"Twitchiä, Kickiä tai Googlea käytetään relay-tilisi tunnistamiseen. Lähetysavainta ei kysytä sisäänkirjautumisessa.",
	notLinked:
		"Tämä tunnus vastaa olemassa olevaa VISP-tiliä. Kirjaudu ensin käyttämälläsi palvelulla ja yhdistä tämä tunnus hallintapaneelista.",
	twitch: "Jatka Twitchillä",
	twitchPending: "Avataan Twitchiä...",
	kick: "Jatka Kickillä",
	kickPending: "Avataan Kickiä...",
	google: "Jatka Googlella",
	googlePending: "Avataan Googlea...",
	agreeBefore: "Jatkamalla hyväksyt ",
	terms: "käyttöehdot",
	agreeAnd: " ja ",
	privacy: "tietosuojaselosteen",
	assurances: [
		{
			tag: "KEY",
			body: "Lähetysavainta ei liitetä — VISP hakee sen OAuth-luvalla.",
		},
		{ tag: "OBS", body: "Syötteesi pysyvät omalla OBS-koneellasi." },
		{ tag: "OAUTH", body: "Voit perua käyttöoikeuden hallintapaneelista." },
	],
};

function RouteComponent() {
	const { error, redirect } = Route.useSearch();
	const locale = useLocale();
	const fi = locale === "fi";
	const copy = fi ? fiCopy : en;
	const [pending, setPending] = useState<"twitch" | "kick" | "google">();
	const returnPath = safeReturnPath(
		redirect ?? (fi ? "/setup?lang=fi" : undefined),
	);
	const errorReturnPath = `/login?redirect=${encodeURIComponent(returnPath)}${fi ? "&lang=fi" : ""}`;

	const signIn = async (provider: "twitch" | "kick" | "google") => {
		setPending(provider);
		const callbackPath = new URL(returnPath, window.location.origin);
		callbackPath.searchParams.set("auth_method", provider);
		const callbackURL = authRedirectURL(
			`${callbackPath.pathname}${callbackPath.search}`,
		);
		const result =
			provider !== "kick"
				? await authClient.signIn.social({
						provider,
						callbackURL,
						errorCallbackURL: authRedirectURL(errorReturnPath),
					})
				: await authClient.signIn.oauth2({
						providerId: provider,
						callbackURL,
						errorCallbackURL: authRedirectURL(errorReturnPath),
					});
		if (result.error) {
			toast.error(result.error.message ?? `${provider} sign-in failed`);
			setPending(undefined);
		}
	};

	return (
		<main className="mx-auto w-full max-w-[900px] overflow-y-auto px-6 py-14">
			<div className="lander-rise grid gap-10 md:grid-cols-[1fr_0.8fr] md:gap-14">
				<div className="flex flex-col gap-8">
					<PageHeader
						eyebrow={copy.eyebrow}
						title={copy.title}
						subtitle={copy.subtitle}
					/>

					{error === "account_not_linked" && (
						<p className="border-tally border-l-2 bg-card/40 px-4 py-3 text-sm leading-relaxed">
							{copy.notLinked}
						</p>
					)}

					<div className="flex flex-col gap-3">
						<ProviderButton
							disabled={Boolean(pending)}
							onClick={() => signIn("twitch")}
						>
							{pending === "twitch" ? copy.twitchPending : copy.twitch}
						</ProviderButton>
						<ProviderButton
							disabled={Boolean(pending)}
							onClick={() => signIn("kick")}
							variant="outline"
						>
							{pending === "kick" ? copy.kickPending : copy.kick}
						</ProviderButton>
						<ProviderButton
							disabled={Boolean(pending)}
							onClick={() => signIn("google")}
							variant="outline"
						>
							{pending === "google" ? copy.googlePending : copy.google}
						</ProviderButton>
					</div>

					<p className="font-mono text-[11px] text-muted-foreground leading-relaxed">
						{copy.agreeBefore}
						<Link
							className="underline underline-offset-4 transition-colors hover:text-foreground"
							to={fi ? "/fi/terms" : "/terms"}
						>
							{copy.terms}
						</Link>
						{copy.agreeAnd}
						<Link
							className="underline underline-offset-4 transition-colors hover:text-foreground"
							to={fi ? "/fi/privacy" : "/privacy"}
						>
							{copy.privacy}
						</Link>
						.
					</p>
				</div>

				{/* Reassurance as channel strips, matching the lander's hairline grid. */}
				<ul className="grid h-fit gap-px border border-border bg-border">
					{copy.assurances.map((item) => (
						<li
							className="flex flex-col gap-2 bg-background p-6"
							key={item.tag}
						>
							<span className={EYEBROW}>{item.tag}</span>
							<span className="text-muted-foreground text-sm leading-relaxed">
								{item.body}
							</span>
						</li>
					))}
				</ul>
			</div>
		</main>
	);
}

// Auth-scale CTA: the lander's TryCta idiom at h-12, since the @VISP/ui Button
// tops out at h-9 and reads timid as the only action on the page.
function ProviderButton({
	children,
	disabled,
	onClick,
	variant = "primary",
}: {
	children: ReactNode;
	disabled?: boolean;
	onClick: () => void;
	variant?: "primary" | "outline";
}) {
	return (
		<button
			className={`inline-flex h-12 items-center justify-center rounded-[var(--radius)] px-8 font-medium text-base transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50 ${
				variant === "primary"
					? "bg-primary text-primary-foreground hover:opacity-90"
					: "border border-border text-foreground hover:bg-card"
			}`}
			disabled={disabled}
			onClick={onClick}
			type="button"
		>
			{children}
		</button>
	);
}
