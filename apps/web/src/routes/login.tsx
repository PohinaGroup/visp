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
		token: z.string().optional(),
	}),
	component: RouteComponent,
});

// Hairline field, matching the login page's outlined-button language.
const FIELD =
	"h-11 rounded-[var(--radius)] border border-border bg-transparent px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

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
	emailHeading: "Or sign in with an email address",
	emailIntro:
		"Opens an empty account: no channels connected, no devices, nothing streaming. Good for looking around first.",
	emailLabel: "Email",
	passwordLabel: "Password",
	passwordHint: "At least 10 characters.",
	confirmPasswordLabel: "Confirm password",
	signInAction: "Sign in",
	signInPending: "Signing in...",
	signUpAction: "Create account",
	signUpPending: "Creating account...",
	toSignUp: "New to VISP? Create an account",
	toSignIn: "Already have an account? Sign in",
	forgotPassword: "Forgot password?",
	forgotHeading: "Reset your password",
	forgotIntro: "Enter your email address and we will send you a reset link.",
	sendResetAction: "Send reset link",
	sendResetPending: "Sending reset link...",
	resetHeading: "Choose a new password",
	resetAction: "Save new password",
	resetPending: "Saving password...",
	verificationSent:
		"Check your email to verify your address before signing in.",
	resetSent: "If that account exists, a password reset link is on its way.",
	resetComplete: "Your password has been reset. You can sign in now.",
	invalidReset: "That password reset link is invalid or has expired.",
	passwordMismatch: "The passwords do not match.",
	emailFailed: "Check the email and password, then try again.",
	agreeBefore: "By continuing, you agree to the ",
	terms: "Terms of Service",
	agreeAnd: " and ",
	privacy: "Privacy Policy",
	assurances: [
		{ tag: "KEY", body: "No stream key pasting — VISP fetches it over OAuth." },
		{
			tag: "DIRECT",
			body: "Go live without putting a stream key on your phone.",
		},
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
	emailHeading: "Tai kirjaudu sähköpostilla",
	emailIntro:
		"Avaa tyhjän tilin: ei yhdistettyjä kanavia, ei laitteita, ei lähetystä. Sopii ensin tutustumiseen.",
	emailLabel: "Sähköposti",
	passwordLabel: "Salasana",
	passwordHint: "Vähintään 10 merkkiä.",
	confirmPasswordLabel: "Vahvista salasana",
	signInAction: "Kirjaudu",
	signInPending: "Kirjaudutaan...",
	signUpAction: "Luo tili",
	signUpPending: "Luodaan tiliä...",
	toSignUp: "Uusi käyttäjä? Luo tili",
	toSignIn: "Onko sinulla jo tili? Kirjaudu",
	forgotPassword: "Unohditko salasanasi?",
	forgotHeading: "Palauta salasana",
	forgotIntro: "Anna sähköpostiosoitteesi, niin lähetämme palautuslinkin.",
	sendResetAction: "Lähetä palautuslinkki",
	sendResetPending: "Lähetetään palautuslinkkiä...",
	resetHeading: "Valitse uusi salasana",
	resetAction: "Tallenna uusi salasana",
	resetPending: "Tallennetaan salasanaa...",
	verificationSent: "Vahvista sähköpostiosoitteesi ennen kirjautumista.",
	resetSent: "Jos tili on olemassa, salasanan palautuslinkki on lähetetty.",
	resetComplete: "Salasanasi on vaihdettu. Voit nyt kirjautua.",
	invalidReset: "Salasanan palautuslinkki on virheellinen tai vanhentunut.",
	passwordMismatch: "Salasanat eivät täsmää.",
	emailFailed: "Tarkista sähköposti ja salasana ja yritä uudelleen.",
	agreeBefore: "Jatkamalla hyväksyt ",
	terms: "käyttöehdot",
	agreeAnd: " ja ",
	privacy: "tietosuojaselosteen",
	assurances: [
		{
			tag: "KEY",
			body: "Lähetysavainta ei liitetä — VISP hakee sen OAuth-luvalla.",
		},
		{
			tag: "DIRECT",
			body: "Aloita lähetys ilman, että lähetysavain tallentuu puhelimeen.",
		},
		{ tag: "OAUTH", body: "Voit perua käyttöoikeuden hallintapaneelista." },
	],
};

function RouteComponent() {
	const { error, redirect, token } = Route.useSearch();
	const locale = useLocale();
	const fi = locale === "fi";
	const copy = fi ? fiCopy : en;
	const [pending, setPending] = useState<"twitch" | "kick" | "google">();
	const [mode, setMode] = useState<"forgot" | "reset" | "sign-in" | "sign-up">(
		token ? "reset" : "sign-in",
	);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [emailPending, setEmailPending] = useState(false);
	const [emailMessage, setEmailMessage] = useState(
		error === "INVALID_TOKEN" ? copy.invalidReset : "",
	);
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

	const signInWithEmail = async () => {
		setEmailPending(true);
		setEmailMessage("");

		if (mode === "forgot") {
			const result = await authClient.requestPasswordReset({
				email,
				redirectTo: authRedirectURL(`/login${fi ? "?lang=fi" : ""}`),
			});
			if (result.error) toast.error(result.error.message ?? copy.emailFailed);
			else setEmailMessage(copy.resetSent);
			setEmailPending(false);
			return;
		}

		if (mode === "reset") {
			if (password !== confirmPassword) {
				toast.error(copy.passwordMismatch);
				setEmailPending(false);
				return;
			}
			const result = await authClient.resetPassword({
				newPassword: password,
				token,
			});
			if (result.error) toast.error(result.error.message ?? copy.invalidReset);
			else {
				setMode("sign-in");
				setPassword("");
				setConfirmPassword("");
				setEmailMessage(copy.resetComplete);
				window.history.replaceState(null, "", errorReturnPath);
			}
			setEmailPending(false);
			return;
		}

		const result =
			mode === "sign-up"
				? await authClient.signUp.email({
						email,
						password,
						name: email.split("@")[0] ?? "tester",
						callbackURL: authRedirectURL(returnPath),
					})
				: await authClient.signIn.email({
						email,
						password,
						callbackURL: authRedirectURL(returnPath),
					});
		if (result.error) {
			if (result.error.code === "EMAIL_NOT_VERIFIED") {
				setEmailMessage(copy.verificationSent);
			}
			toast.error(result.error.message ?? copy.emailFailed);
			setEmailPending(false);
			return;
		}
		if (mode === "sign-up") {
			setEmailMessage(copy.verificationSent);
			setPassword("");
			setEmailPending(false);
			return;
		}
		window.location.assign(returnPath);
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

					<form
						className="flex flex-col gap-4 border-border border-t pt-8"
						onSubmit={(event) => {
							event.preventDefault();
							void signInWithEmail();
						}}
					>
						<div className="flex flex-col gap-2">
							<h2 className="font-display font-semibold text-2xl uppercase leading-none tracking-tight">
								{mode === "forgot"
									? copy.forgotHeading
									: mode === "reset"
										? copy.resetHeading
										: copy.emailHeading}
							</h2>
							{mode !== "reset" ? (
								<p className="max-w-[60ch] text-muted-foreground text-sm leading-relaxed">
									{mode === "forgot" ? copy.forgotIntro : copy.emailIntro}
								</p>
							) : null}
						</div>

						{mode !== "reset" ? (
							<label className="flex flex-col gap-1.5 text-sm" htmlFor="email">
								{copy.emailLabel}
								<input
									autoComplete="email"
									className={FIELD}
									id="email"
									name="email"
									required
									type="email"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
								/>
							</label>
						) : null}

						{mode !== "forgot" ? (
							<label
								className="flex flex-col gap-1.5 text-sm"
								htmlFor="password"
							>
								{copy.passwordLabel}
								<input
									autoComplete={
										mode === "sign-in" ? "current-password" : "new-password"
									}
									className={FIELD}
									id="password"
									minLength={10}
									name="password"
									required
									type="password"
									value={password}
									onChange={(event) => setPassword(event.target.value)}
								/>
								{mode !== "sign-in" ? (
									<span className="text-muted-foreground text-xs">
										{copy.passwordHint}
									</span>
								) : null}
							</label>
						) : null}

						{mode === "reset" ? (
							<label
								className="flex flex-col gap-1.5 text-sm"
								htmlFor="confirm-password"
							>
								{copy.confirmPasswordLabel}
								<input
									autoComplete="new-password"
									className={FIELD}
									id="confirm-password"
									minLength={10}
									name="confirm-password"
									required
									type="password"
									value={confirmPassword}
									onChange={(event) => setConfirmPassword(event.target.value)}
								/>
							</label>
						) : null}

						{emailMessage ? (
							<p
								className="border-tally border-l-2 bg-card/40 px-4 py-3 text-sm leading-relaxed"
								role="status"
							>
								{emailMessage}
							</p>
						) : null}

						<ProviderButton
							disabled={emailPending || Boolean(pending)}
							type="submit"
							variant="outline"
						>
							{mode === "forgot"
								? emailPending
									? copy.sendResetPending
									: copy.sendResetAction
								: mode === "reset"
									? emailPending
										? copy.resetPending
										: copy.resetAction
									: mode === "sign-up"
										? emailPending
											? copy.signUpPending
											: copy.signUpAction
										: emailPending
											? copy.signInPending
											: copy.signInAction}
						</ProviderButton>

						{mode !== "reset" ? (
							<div className="flex flex-wrap gap-x-4 gap-y-2">
								<button
									className="text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
									type="button"
									onClick={() => {
										setEmailMessage("");
										setMode(mode === "sign-in" ? "sign-up" : "sign-in");
									}}
								>
									{mode === "sign-in" ? copy.toSignUp : copy.toSignIn}
								</button>
								{mode === "sign-in" ? (
									<button
										className="text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground"
										type="button"
										onClick={() => {
											setEmailMessage("");
											setMode("forgot");
										}}
									>
										{copy.forgotPassword}
									</button>
								) : null}
							</div>
						) : null}
					</form>

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
	type = "button",
	variant = "primary",
}: {
	children: ReactNode;
	disabled?: boolean;
	onClick?: () => void;
	type?: "button" | "submit";
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
			type={type}
		>
			{children}
		</button>
	);
}
