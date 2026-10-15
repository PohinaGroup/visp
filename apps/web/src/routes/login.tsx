import { createFileRoute, Link } from "@tanstack/react-router";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
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

// Hairline field, matching the provider rows.
const FIELD =
	"h-11 rounded-[var(--radius)] border border-border bg-transparent px-3 text-base text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

function hasForbiddenPathChar(value: string) {
	if (value.includes("\\")) return true;
	for (let index = 0; index < value.length; index++) {
		if (value.charCodeAt(index) <= 32) return true;
	}
	return false;
}

function safeReturnPath(value: string | undefined) {
	return value?.startsWith("/") &&
		!value.startsWith("//") &&
		!hasForbiddenPathChar(value)
		? value
		: "/setup";
}

const en = {
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
	emailHeading: "Use an email address instead",
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
	chainHeading: "Where your stream key goes",
	account: "Your account",
	providerAccount: {
		twitch: "Twitch account",
		kick: "Kick account",
		google: "Google account",
	},
	chain: [
		"Identifies you. Revoke VISP's access from the dashboard at any time.",
		"Fetches your stream key over OAuth. You never paste it.",
		"Direct goes live from your phone without putting the key on it.",
	],
	nodes: ["VISP relay", "OBS or Direct", "Your channel"],
};

const fiCopy: typeof en = {
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
	emailHeading: "Käytä sähköpostiosoitetta",
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
	chainHeading: "Mihin lähetysavaimesi kulkee",
	account: "Oma tilisi",
	providerAccount: {
		twitch: "Twitch-tili",
		kick: "Kick-tili",
		google: "Google-tili",
	},
	chain: [
		"Tunnistaa sinut. Voit perua VISPin käyttöoikeuden hallintapaneelista milloin tahansa.",
		"Hakee lähetysavaimesi OAuth-luvalla. Sinun ei tarvitse liittää sitä.",
		"Directillä lähetät puhelimesta ilman, että avain tallentuu puhelimeen.",
	],
	nodes: ["VISP-relay", "OBS tai Direct", "Kanavasi"],
};

function RouteComponent() {
	const { error, redirect, token } = Route.useSearch();
	const locale = useLocale();
	const fi = locale === "fi";
	const copy = fi ? fiCopy : en;
	const [pending, setPending] = useState<Provider>();
	const [hovered, setHovered] = useState<Provider>();
	const [mode, setMode] = useState<"forgot" | "reset" | "sign-in" | "sign-up">(
		token ? "reset" : "sign-in",
	);
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [emailPending, setEmailPending] = useState(false);
	const [emailOpen, setEmailOpen] = useState(
		Boolean(token) || error === "INVALID_TOKEN",
	);
	const [emailMessage, setEmailMessage] = useState(
		error === "INVALID_TOKEN" ? copy.invalidReset : "",
	);
	const returnPath = safeReturnPath(
		redirect ?? (fi ? "/setup?lang=fi" : undefined),
	);
	const errorReturnPath = `/login?redirect=${encodeURIComponent(returnPath)}${fi ? "&lang=fi" : ""}`;

	const signIn = async (provider: Provider) => {
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
				: await authClient.signIn.social({
						provider: provider,
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

	const submitLabel =
		mode === "forgot"
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
						: copy.signInAction;

	// The chain's first node follows the provider being pointed at or opened.
	const source = pending ?? hovered;

	return (
		<main className="mx-auto w-full max-w-[1040px] overflow-y-auto px-6 py-14">
			<div className="lander-rise grid gap-14 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] md:gap-20">
				<div className="flex max-w-xl flex-col gap-8">
					<PageHeader title={copy.title} subtitle={copy.subtitle} />

					{error === "account_not_linked" && (
						<p className="border-tally border-l-2 bg-card/40 px-4 py-3 text-sm leading-relaxed">
							{copy.notLinked}
						</p>
					)}

					<div className="flex flex-col gap-3">
						{PROVIDERS.map((provider) => (
							<ProviderButton
								disabled={Boolean(pending)}
								key={provider}
								onBlur={() => setHovered(undefined)}
								onClick={() => signIn(provider)}
								onFocus={() => setHovered(provider)}
								onMouseEnter={() => setHovered(provider)}
								onMouseLeave={() => setHovered(undefined)}
								state={
									pending === provider
										? "pending"
										: source === provider
											? "armed"
											: "idle"
								}
							>
								{pending === provider
									? copy[`${provider}Pending`]
									: copy[provider]}
							</ProviderButton>
						))}
					</div>

					<details
						className="group border-border border-t pt-6"
						onToggle={(event) => setEmailOpen(event.currentTarget.open)}
						open={emailOpen}
					>
						<summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
							{copy.emailHeading}
							<span
								aria-hidden
								className="font-mono text-base leading-none transition-transform group-open:rotate-45"
							>
								+
							</span>
						</summary>

						<form
							className="flex flex-col gap-4 pt-6"
							onSubmit={(event) => {
								event.preventDefault();
								void signInWithEmail();
							}}
						>
							{mode === "forgot" || mode === "reset" ? (
								<h2 className="font-display font-semibold text-2xl uppercase leading-none tracking-tight">
									{mode === "forgot" ? copy.forgotHeading : copy.resetHeading}
								</h2>
							) : null}
							{mode !== "reset" ? (
								<p className="max-w-[60ch] text-muted-foreground text-sm leading-relaxed">
									{mode === "forgot" ? copy.forgotIntro : copy.emailIntro}
								</p>
							) : null}

							{mode !== "reset" ? (
								<label
									className="flex flex-col gap-1.5 text-sm"
									htmlFor="email"
								>
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
									className="border-caution border-l-2 bg-card/40 px-4 py-3 text-sm leading-relaxed"
									role="status"
								>
									{emailMessage}
								</p>
							) : null}

							<button
								className="inline-flex h-12 items-center justify-center rounded-[var(--radius)] bg-primary px-8 font-medium text-base text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50"
								disabled={emailPending || Boolean(pending)}
								type="submit"
							>
								{submitLabel}
							</button>

							{mode !== "reset" ? (
								<div className="flex flex-wrap gap-x-4 gap-y-2">
									<button
										className={TEXT_LINK}
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
											className={TEXT_LINK}
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
					</details>

					<p className="text-muted-foreground text-xs leading-relaxed">
						{copy.agreeBefore}
						<Link className={TEXT_LINK_INLINE} to={fi ? "/fi/terms" : "/terms"}>
							{copy.terms}
						</Link>
						{copy.agreeAnd}
						<Link
							className={TEXT_LINK_INLINE}
							to={fi ? "/fi/privacy" : "/privacy"}
						>
							{copy.privacy}
						</Link>
						.
					</p>
				</div>

				{/* Where the key travels: the signal chain, sign-in as its first node. */}
				<aside aria-labelledby="chain-heading" className="md:pt-2">
					<h2 className="pb-6 text-muted-foreground text-sm" id="chain-heading">
						{copy.chainHeading}
					</h2>
					<ol className="flex flex-col">
						<ChainNode
							body={copy.chain[0]}
							name={source ? copy.providerAccount[source] : copy.account}
							state={pending ? "pending" : "here"}
						/>
						<ChainNode body={copy.chain[1]} name={copy.nodes[0]} />
						<ChainNode body={copy.chain[2]} name={copy.nodes[1]} />
						<ChainNode last name={copy.nodes[2]} />
					</ol>
				</aside>
			</div>
		</main>
	);
}

const PROVIDERS = ["twitch", "kick", "google"] as const;
type Provider = (typeof PROVIDERS)[number];

const TEXT_LINK =
	"text-muted-foreground text-sm underline underline-offset-4 transition-colors hover:text-foreground";
const TEXT_LINK_INLINE =
	"underline underline-offset-4 transition-colors hover:text-foreground";

// One stop on the chain: a square on a hairline rail. The first node is where
// the visitor is now (solid), amber while a provider sign-in is opening.
function ChainNode({
	body,
	last = false,
	name,
	state = "downstream",
}: {
	body?: string;
	last?: boolean;
	name: string;
	state?: "here" | "pending" | "downstream";
}) {
	return (
		<li className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-4">
			{last ? null : (
				<span
					aria-hidden
					className="absolute top-3 bottom-0 left-[calc(0.625rem-0.5px)] w-px bg-border"
				/>
			)}
			<span
				aria-hidden
				className={`relative mt-[0.4rem] size-2.5 justify-self-center ${
					state === "pending"
						? "tally-pulse bg-caution"
						: state === "here"
							? "bg-foreground"
							: "border border-muted-foreground bg-background"
				}`}
			/>
			<div className={`flex flex-col gap-1.5 ${last ? "" : "pb-8"}`}>
				<span
					className={`font-display font-semibold text-xl uppercase leading-tight tracking-tight ${
						state === "downstream" ? "text-muted-foreground" : ""
					}`}
				>
					{name}
				</span>
				{body ? (
					<p className="text-muted-foreground text-sm leading-relaxed">
						{body}
					</p>
				) : null}
			</div>
		</li>
	);
}

// Auth-scale provider row: label left, a node square right that lights as the
// row is armed, the same square the chain uses for its first stop.
function ProviderButton({
	children,
	state,
	...props
}: {
	children: ReactNode;
	state: "idle" | "armed" | "pending";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "type">) {
	return (
		<button
			className={`inline-flex h-14 items-center justify-between rounded-[var(--radius)] border px-5 font-medium text-base transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-default ${
				state === "idle"
					? "border-border text-foreground disabled:opacity-50"
					: "border-foreground bg-card text-foreground"
			}`}
			type="button"
			{...props}
		>
			{children}
			<span
				aria-hidden
				className={`size-2.5 ${
					state === "pending"
						? "tally-pulse bg-caution"
						: state === "armed"
							? "bg-foreground"
							: "border border-muted-foreground"
				}`}
			/>
		</button>
	);
}
