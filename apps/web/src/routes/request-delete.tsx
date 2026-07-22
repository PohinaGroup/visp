import { Button, buttonVariants } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { authClient, authRedirectURL } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/request-delete")({
	validateSearch: z.object({
		deleted: z
			.literal("1")
			.optional()
			.transform((value) => (value === "1" ? true : undefined)),
		lang: z.literal("fi").optional(),
	}),
	head: () => ({
		meta: [
			{ title: "Delete your VISP account" },
			{
				name: "description",
				content: "Request deletion of your VISP account and associated data.",
			},
		],
	}),
	component: RequestDelete,
});

function RequestDelete() {
	const { deleted } = Route.useSearch();
	const fi = useLocale() === "fi";
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const [pending, setPending] = useState(false);
	const [signingProvider, setSigningProvider] = useState<"twitch" | "kick">();

	const signIn = async (provider: "twitch" | "kick") => {
		setPending(true);
		setSigningProvider(provider);
		const result =
			provider === "twitch"
				? await authClient.signIn.social({
						provider,
						callbackURL: authRedirectURL(
							`/request-delete${fi ? "?lang=fi" : ""}`,
						),
					})
				: await authClient.signIn.oauth2({
						providerId: provider,
						callbackURL: authRedirectURL(
							`/request-delete${fi ? "?lang=fi" : ""}`,
						),
					});
		if (result.error) {
			toast.error(result.error.message ?? `${provider} sign-in failed`);
			setPending(false);
			setSigningProvider(undefined);
		}
	};

	const deleteAccount = async () => {
		if (
			!window.confirm(
				fi
					? "Poistetaanko VISP-tilisi ja sen tiedot pysyvästi?"
					: "Permanently delete your VISP account and its data?",
			)
		) {
			return;
		}

		setPending(true);
		const result = await authClient.deleteUser({
			callbackURL: authRedirectURL(
				`/request-delete?deleted=1${fi ? "&lang=fi" : ""}`,
			),
		});
		if (result.error) {
			toast.error(result.error.message ?? "Account deletion failed");
			setPending(false);
		}
	};

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:py-16">
			<header className="flex flex-col gap-4">
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					{fi ? "VISP-tilin hallinta" : "VISP account management"}
				</p>
				<h1 className="font-bold font-display text-5xl uppercase leading-none tracking-tight sm:text-6xl">
					{fi ? "Poista tilisi" : "Delete your account"}
				</h1>
				<p className="max-w-prose text-muted-foreground">
					{fi
						? "Tällä sivulla voit poistaa VISP-tilisi ja siihen liittyvät tiedot pysyvästi. VISP-sovellusta ei tarvitse poistaa ensin."
						: "Use this page to permanently delete your VISP account and the data associated with it. You do not need to uninstall the VISP app first."}
				</p>
			</header>

			{deleted ? (
				<p className="border border-border bg-card p-4" role="status">
					{fi
						? "VISP-tilisi ja sen aktiiviset tiedot on poistettu."
						: "Your VISP account and its active data have been deleted."}
				</p>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>
						{fi ? "Pyydä tilin poistamista" : "Request account deletion"}
					</CardTitle>
					<CardDescription>
						{fi
							? "Poistaminen on pysyvää, eikä sitä voi peruuttaa."
							: "Deletion is permanent and cannot be undone."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
						<li>
							{fi
								? "Kirjaudu VISPiin yhdistetyllä Twitch- tai Kick-tilillä."
								: "Sign in with a Twitch or Kick account connected to VISP."}
						</li>
						<li>
							{fi
								? "Valitse alta ”Poista VISP-tilini”."
								: "Select “Delete my VISP account” below."}
						</li>
						<li>
							{fi
								? "Vahvista poistaminen selaimessa."
								: "Confirm the deletion in your browser."}
						</li>
					</ol>
				</CardContent>
				<CardFooter className="flex flex-wrap gap-3">
					{sessionPending ? (
						<Button disabled>
							{fi ? "Tarkistetaan tiliä..." : "Checking account..."}
						</Button>
					) : session ? (
						<Button
							disabled={pending}
							onClick={deleteAccount}
							variant="destructive"
						>
							{pending
								? fi
									? "Poistetaan tiliä..."
									: "Deleting account..."
								: fi
									? "Poista VISP-tilini"
									: "Delete my VISP account"}
						</Button>
					) : (
						<>
							<Button disabled={pending} onClick={() => void signIn("twitch")}>
								{signingProvider === "twitch"
									? fi
										? "Avataan Twitchiä..."
										: "Opening Twitch..."
									: fi
										? "Kirjaudu Twitchillä"
										: "Sign in with Twitch"}
							</Button>
							<Button
								disabled={pending}
								onClick={() => void signIn("kick")}
								variant="outline"
							>
								{signingProvider === "kick"
									? fi
										? "Avataan Kickiä..."
										: "Opening Kick..."
									: fi
										? "Kirjaudu Kickillä"
										: "Sign in with Kick"}
							</Button>
						</>
					)}
					<Link
						className={buttonVariants({ variant: "outline" })}
						to={fi ? "/fi" : "/"}
					>
						{fi ? "Peruuta" : "Cancel"}
					</Link>
				</CardFooter>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{fi ? "Poistettavat tiedot" : "Data deleted"}</CardTitle>
					<CardDescription>
						{fi
							? "Poistaminen poistaa seuraavat tiedot VISPin aktiivisista järjestelmistä."
							: "Deletion removes the following data from VISP’s active systems."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
						<li>
							{fi
								? "VISP-profiilisi: nimi, sähköpostiosoite, profiilikuva sekä yhdistetyt Twitch- tai Kick-tilit ja tunnisteet"
								: "Your VISP profile, including name, email address, profile image, and linked Twitch or Kick accounts and tokens"}
						</li>
						<li>
							{fi
								? "Kirjautumisistunnot sekä niihin liittyvät laite- tai selaintiedot"
								: "Sign-in sessions and related device or browser information"}
						</li>
						<li>
							{fi
								? "Välityspalvelimen tunnukset, lähetyspolut ja nimet sekä määritysvalinnat"
								: "Relay credentials, stream paths and labels, and setup preferences"}
						</li>
						<li>
							{fi
								? "Tiliisi liittyvät yhteys- ja viivemittaukset"
								: "Connection and latency measurements associated with your account"}
						</li>
						<li>
							{fi
								? "VISP-hallintapaneelin uusimmat lähetyksen esikatselukuvat"
								: "Latest stream snapshots shown in the VISP dashboard"}
						</li>
					</ul>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>
						{fi
							? "Säilytettävät tiedot ja säilytysajat"
							: "Data kept and retention periods"}
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
					<p>
						{fi
							? "VISP välittää kuvaa ja ääntä suorana ja tallentaa hallintapaneelia varten yhden yksityisen, 640 pikseliä leveän esikatselukuvan lähetyspolkua kohti. Kuva korvataan lähetyksen aikana noin minuutin välein ja poistuu vuorokauden kuluessa päivitysten päättymisestä. VISP ei säilytä jatkuvia lähetystallenteita tai keskustelusisältöä."
							: "VISP relays video and audio live and stores one private 640-pixel snapshot per publishing path for the dashboard. It is replaced about once a minute while live and expires within one day after updates stop. VISP does not retain continuous stream recordings or chat content."}
					</p>
					<p>
						{fi
							? "Tilitiedot poistetaan aktiivisista järjestelmistä heti. Salattuja varmuuskopioita voi säilyä enintään 30 päivää ennen niiden korvaamista."
							: "Account data is deleted from active systems immediately. Encrypted backup copies may remain for up to 30 days before they are overwritten."}
					</p>
					<p>
						{fi
							? "Turvallisuus- ja palvelulokeja voidaan säilyttää enintään 90 päivää. Niitä säilytetään vain turvallisuuden, väärinkäytösten estämisen ja palvelun luotettavuuden vuoksi, eivätkä ne sisällä lähetyksen sisältöä. Lain edellyttämiä tietoja voidaan säilyttää lakisääteisen ajan."
							: "Security and service logs may be retained for up to 90 days. They are kept only for security, fraud prevention, and service reliability, and do not include stream content. Data required by law may be retained for the legally required period."}
					</p>
				</CardContent>
			</Card>

			<p className="text-muted-foreground text-sm">
				{fi
					? "Jos et voi kirjautua, lähetä sähköpostia osoitteeseen "
					: "If you cannot sign in, email "}
				<a
					className="text-foreground underline underline-offset-4"
					href={`mailto:${legalEntity.email}?subject=VISP%20account%20deletion`}
				>
					{legalEntity.email}
				</a>{" "}
				{fi
					? `(${legalEntity.companyName}). Liitä viestiin Twitch- tai Kick-käyttäjänimesi ja käytä aihetta ”VISP account deletion”. Katso myös `
					: `(${legalEntity.companyName}) with your Twitch or Kick username and the subject “VISP account deletion.” See also `}
				<Link
					className="text-foreground underline underline-offset-4"
					to={fi ? "/fi/contact" : "/contact"}
				>
					{fi ? "yhteystiedot" : "Contact"}
				</Link>{" "}
				{fi ? "ja " : "and the "}
				<Link
					className="text-foreground underline underline-offset-4"
					to={fi ? "/fi/privacy" : "/privacy"}
				>
					{fi ? "tietosuojakäytäntö" : "Privacy Policy"}
				</Link>
				.
			</p>
		</main>
	);
}
