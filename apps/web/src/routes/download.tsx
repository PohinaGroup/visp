import { buttonVariants } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { getObsPluginRelease } from "@/functions/get-obs-releases";
import { docs } from "@/lib/docs";
import { localeSearch, useLocale } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";
import type { ObsPluginRelease } from "@/lib/obs-releases";

export const Route = createFileRoute("/download")({
	validateSearch: z.object({
		lang: z.literal("fi").optional(),
	}),
	head: () => ({
		meta: [
			{ title: "Download & beta access — VISP" },
			{
				name: "description",
				content:
					"Join the VISP hosted beta and get the phone apps, browser publisher, and OBS plugin.",
			},
		],
	}),
	loader: () => getObsPluginRelease(),
	component: DownloadPage,
});

function docsForLocale(fi: boolean) {
	if (!fi) {
		return {
			getStarted: docs.getStarted,
			obsRemoteControl: docs.obsRemoteControl,
			selfHosting: docs.selfHosting,
			docsHome: legalEntity.docsUrl,
		};
	}
	const base = `${legalEntity.docsUrl}/fi`;
	return {
		getStarted: `${base}/docs/get-started`,
		obsRemoteControl: `${base}/docs/obs-remote-control`,
		selfHosting: `${base}/docs/self-hosting`,
		docsHome: base,
	};
}

function DownloadPage() {
	const obsRelease = Route.useLoaderData();
	const locale = useLocale();
	const fi = locale === "fi";
	const localeDocs = docsForLocale(fi);
	const search = localeSearch(locale);

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-12 sm:py-16">
			<header className="flex flex-col gap-4">
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					{fi ? "Aloita" : "Get started"}
				</p>
				<h1 className="font-bold font-display text-5xl uppercase leading-none tracking-tight sm:text-6xl">
					{fi ? "Lataus ja beta" : "Download & beta"}
				</h1>
				<p className="max-w-prose text-muted-foreground">
					{fi
						? "Hostattu beta on nopein tapa kokeilla VISPiä. Kirjaudu sisään, valitse striimausohjelma ja lähetä puhelimen tai selaimen kamera kotona olevaan OBS-setuppiin."
						: "The hosted beta is the fastest way to try VISP. Sign in, pick a client, and send a phone or browser camera into your home OBS setup. Self-hosting is available for operators who want to run their own relay."}
				</p>
			</header>

			<Card>
				<CardHeader>
					<CardTitle>{fi ? "1. Liity betaan" : "1. Join the beta"}</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 text-muted-foreground text-sm">
					<ol className="list-decimal space-y-2 pl-5">
						<li>
							{fi
								? "Kirjaudu Twitchillä tai Kickillä luodaksesi VISP-tilin."
								: "Sign in with Twitch or Kick to create your VISP account."}
						</li>
						<li>
							{fi
								? "Vastaa lyhyisiin käyttöönottokysymyksii"
								: "Answer the short setup questions."}
						</li>
						<li>
							{fi
								? "Striimaa tuetulla softalla, ja näät feedin OBS:ssä."
								: "Publish from a supported client below, then watch the feed in OBS."}
						</li>
					</ol>
					<div className="flex flex-wrap gap-2">
						<Link className={buttonVariants()} to="/login" search={search}>
							{fi ? "Kirjaudu aloittaaksesi" : "Sign in to start"}
						</Link>
						<a
							className={buttonVariants({ variant: "outline" })}
							href={localeDocs.getStarted}
							rel="noreferrer"
							target="_blank"
						>
							{fi ? "Lisää ohjeita" : "Get started docs"}
						</a>
					</div>
				</CardContent>
			</Card>

			<section className="flex flex-col gap-4">
				<h2 className="font-display text-2xl uppercase tracking-tight">
					{fi ? "2. Tuetut ohjelmistot" : "2. Supported clients"}
				</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>{fi ? "Selainsovellus" : "Browser app"}</CardTitle>
							<CardDescription>
								{fi
									? "Julkaise Chromesta, Edgestä tai Safarista — ei vaadi asennusta."
									: "Publish from Chrome, Edge, or Safari — no install."}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<a
								className={buttonVariants({ variant: "outline" })}
								href={legalEntity.browserAppUrl}
								rel="noreferrer"
								target="_blank"
							>
								{fi
									? "Avaa stream.visp-stream.com"
									: "Open stream.visp-stream.com"}
							</a>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{fi ? "OBS-plugari" : "OBS plugin"}</CardTitle>
							<CardDescription>
								{fi
									? "Kirjaudu OBS:stä, lisää lähteet yhdellä klikkauksella, vaihda scenejä, aloita tai lopeta lähetys etänä verkosta tai sovelluksesta."
									: "Sign in from OBS, add Sources with one click, change scenes, and start/stop going live from web or mobile."}
								{obsRelease
									? fi
										? ` Uusin: ${obsRelease.tagName}.`
										: ` Latest: ${obsRelease.tagName}.`
									: null}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3">
							<ObsPluginDownloadLinks release={obsRelease} fi={fi} />
							<p className="text-muted-foreground text-xs">
								{fi
									? "Asennuksen ja yhdistämisen ohjeet: "
									: "Install, then pair from the dashboard OBS card. Docs: "}
								<a
									className="text-foreground underline underline-offset-4"
									href={localeDocs.obsRemoteControl}
									rel="noreferrer"
									target="_blank"
								>
									{fi ? "OBS-ohjaus" : "OBS remote control"}
								</a>
								.
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{fi ? "iOS-sovellus" : "iOS app"}</CardTitle>
							<CardDescription>
								{fi
									? "Astetta helpompi tapa striimata iOS-puhelimelta. iOS 16.4+ TestFlightin avoimessa testauksessa."
									: "A bit easier way to stream from mobile. iOS 16.4+ via TestFlight open testing."}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
							<p>
								{fi
									? "Asenna TestFlight-sovellus ja liity VISP-betaan."
									: "Install the TestFlight app, then join the VISP beta."}
							</p>
							<a
								className={buttonVariants({ variant: "outline" })}
								href={legalEntity.iosTestFlightUrl}
								rel="noreferrer"
								target="_blank"
							>
								{fi ? "Liity TestFlightissa" : "Join on TestFlight"}
							</a>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{fi ? "Android-sovellus" : "Android app"}</CardTitle>
							<CardDescription>
								{fi
									? "Astetta helpompi tapa striimata Android-puhelimelta. Android 7+ Playn avoimessa testauksessa. SRT-julkaisu fyysiseltä laitteelta."
									: "A bit easier way to stream from mobile. Android 7+ via Play open testing. SRT publish from a physical device."}
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-3 text-muted-foreground text-sm">
							<p>
								{fi
									? "Liity avoimeen testausohjelmaan millä tahansa Google-tilillä ja asenna VISP Google Playsta."
									: "Join the open testing program with any Google account, then install VISP from Google Play."}
							</p>
							<a
								className={buttonVariants({ variant: "outline" })}
								href={legalEntity.androidPlayTestingUrl}
								rel="noreferrer"
								target="_blank"
							>
								{fi ? "Liity Google Playssa" : "Join on Google Play"}
							</a>
						</CardContent>
					</Card>
				</div>
			</section>

			<Card>
				<CardHeader>
					<CardTitle>
						{fi
							? "3. Dokumentaatio, lähdekoodi ja self-hosting"
							: "3. Docs, source, and self-hosting"}
					</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4 text-muted-foreground text-sm">
					<div className="flex flex-wrap gap-2">
						<a
							className={buttonVariants({ variant: "outline" })}
							href={localeDocs.docsHome}
							rel="noreferrer"
							target="_blank"
						>
							{fi ? "Dokumentaatio" : "Documentation"}
						</a>
						<a
							className={buttonVariants({ variant: "outline" })}
							href={legalEntity.sourceUrl}
							rel="noreferrer"
							target="_blank"
						>
							GitHub
						</a>
						<a
							className={buttonVariants({ variant: "outline" })}
							href={localeDocs.selfHosting}
							rel="noreferrer"
							target="_blank"
						>
							{fi ? "Itsehostausohjeet" : "Self-hosting docs"}
						</a>
					</div>
				</CardContent>
			</Card>

			<nav
				aria-label={fi ? "Sivuston linkit" : "Site links"}
				className="flex flex-wrap gap-x-4 gap-y-2 border-border border-t pt-6 font-mono text-muted-foreground text-xs"
			>
				<Link
					className="hover:text-foreground"
					to={fi ? "/fi/privacy" : "/privacy"}
				>
					{fi ? "Tietosuoja" : "Privacy"}
				</Link>
				<Link
					className="hover:text-foreground"
					to={fi ? "/fi/terms" : "/terms"}
				>
					{fi ? "Käyttöehdot" : "Terms"}
				</Link>
				<Link
					className="hover:text-foreground"
					to={fi ? "/fi/cookies" : "/cookies"}
				>
					{fi ? "Evästeet" : "Cookies"}
				</Link>
				<Link
					className="hover:text-foreground"
					to={fi ? "/fi/contact" : "/contact"}
				>
					{fi ? "Yhteystiedot" : "Contact"}
				</Link>
				<a
					className="hover:text-foreground"
					href={legalEntity.sourceUrl}
					rel="noreferrer"
					target="_blank"
				>
					{fi ? "Lähdekoodi" : "Source"}
				</a>
				<a
					className="hover:text-foreground"
					href={localeDocs.docsHome}
					rel="noreferrer"
					target="_blank"
				>
					{fi ? "Ohjeet" : "Docs"}
				</a>
			</nav>
		</main>
	);
}

function ObsPluginDownloadLinks({
	release,
	fi,
}: {
	release: ObsPluginRelease | null;
	fi: boolean;
}) {
	if (!release || release.assets.length === 0) {
		return (
			<a
				className={buttonVariants({ variant: "outline" })}
				href={legalEntity.releasesUrl}
				rel="noreferrer"
				target="_blank"
			>
				{fi ? "Lataa GitHub Releasesistä" : "Download from GitHub Releases"}
			</a>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-2">
				{release.assets.map((asset) => (
					<a
						key={asset.platform}
						className={buttonVariants({ variant: "outline" })}
						download={asset.fileName}
						href={asset.downloadUrl}
						rel="noreferrer"
						target="_blank"
					>
						{asset.label}
					</a>
				))}
			</div>
			<a
				className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
				href={release.htmlUrl}
				rel="noreferrer"
				target="_blank"
			>
				{fi
					? `Kaikki tiedostot GitHubissa (${release.tagName})`
					: `All assets on GitHub (${release.tagName})`}
			</a>
		</div>
	);
}
