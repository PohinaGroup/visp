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
import { localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/fi/cookies")({
	head: () => ({
		meta: [
			{ title: "Evästekäytäntö — VISP" },
			{
				name: "description",
				content: "Miten VISP käyttää evästeitä ja vastaavia tekniikoita.",
			},
		],
		links: localizedHead("fi", "/fi/cookies"),
	}),
	component: CookiesPage,
});

function CookiesPage() {
	const [consent, setConsent] = useState<CookieConsent | null>(null);

	useEffect(() => {
		setConsent(readCookieConsent());
		const onChange = (event: Event) =>
			setConsent((event as CustomEvent<CookieConsent>).detail);
		window.addEventListener("visp:cookie-consent", onChange);
		return () => window.removeEventListener("visp:cookie-consent", onChange);
	}, []);

	const choose = (choice: CookieConsentChoice) =>
		setConsent(writeCookieConsent(choice));

	return (
		<LegalDoc
			eyebrow="Lakiasiat"
			title="Evästekäytäntö"
			description="Tässä käytännössä selitetään, miten VISP käyttää evästeitä ja vastaavia tekniikoita verkkosivustolla ja verkkosovelluksessa."
			updated="19. heinäkuuta 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>1. Palveluntarjoaja</h2>
				<p>
					Evästeitä käyttää VISPin yhteydessä{" "}
					<strong>{legalEntity.companyName}</strong> (Y-tunnus{" "}
					{legalEntity.businessId}). Yhteys:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>2. Mitä evästeet ovat?</h2>
				<p>
					Evästeet ovat laitteellesi tallennettavia pieniä tekstitiedostoja.
					Vastaaviin tekniikoihin kuuluu selaimen paikallinen tallennus. Osa on
					välttämättömiä palvelun toiminnalle, ja valinnaisia käytetään vain
					suostumuksellasi.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>3. Välttämättömät evästeet</h2>
				<p>
					Nämä tarvitaan pyytämäsi palvelun tarjoamiseen eikä niitä voi poistaa
					käytöstä järjestelmissämme:
				</p>
				<ul>
					<li>
						<strong>Tunnistus- ja istuntoevästeet</strong> pitävät sinut
						turvallisesti kirjautuneena (tunnistusjärjestelmän asettamat
						httpOnly-istuntoevästeet).
					</li>
					<li>
						<strong>Turvallisuusevästeet</strong> suojaavat tilejä ja pyyntöjä,
						kuten CSRF-suojaus ja istunnon eheys soveltuvin osin.
					</li>
				</ul>
				<p>
					Käsittely perustuu oikeutettuun etuumme ja tarpeeseen tarjota palvelu
					sähköisen viestinnän tietosuojasäännösten ja GDPR:n mukaisesti.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>4. Evästeetön analytiikka</h2>
				<p>
					Kun se on määritetty käyttöön, VISP käyttää{" "}
					<a
						href="https://rybbit.com"
						rel="noopener noreferrer"
						target="_blank"
					>
						Rybbit
					</a>
					-palvelua tietosuojaa painottavaan tuoteanalytiikkaan, kuten
					sivunäyttöihin ja perustason käyttömittareihin. Rybbit toimii ilman
					seurantaevästeitä tai paikallista tallennusta, joten alla oleva
					valinnaisten evästeiden valinta ei estä sitä. Hallintapaneelin
					arkaluonteiset arvot, kuten julkaisuosoitteet, jätetään istuntotoiston
					ulkopuolelle, kun ominaisuus on käytössä.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>5. Valinnaiset evästeet</h2>
				<p>
					Valinnaisia evästeitä käytetään vain valitessasi{" "}
					<strong>Hyväksy kaikki</strong>. VISP ei tällä hetkellä aseta muita
					valinnaisia evästeitä kuin tämän valinnan muistamisen.
				</p>
				<p>
					Valinta tallennetaan selaimen paikalliseen tallennukseen avaimella{" "}
					<code className="text-foreground">visp.cookie-consent</code>.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>6. Valinnan hallinta</h2>
				<p>
					Nykyinen valinta:{" "}
					<strong>
						{consent
							? consent.choice === "all"
								? "Hyväksy kaikki"
								: "Vain välttämättömät"
							: "Ei asetettu"}
					</strong>
					{consent
						? ` (tallennettu ${new Date(consent.updatedAt).toLocaleString("fi")})`
						: ""}
					.
				</p>
				<div className="flex flex-wrap gap-2">
					<Button variant="outline" onClick={() => choose("necessary")}>
						Vain välttämättömät
					</Button>
					<Button onClick={() => choose("all")}>Hyväksy kaikki</Button>
				</div>
			</section>
			<section className="flex flex-col gap-3">
				<h2>7. Lisätietoja</h2>
				<p>
					Laajemmat tiedot henkilötietojen käsittelystä ovat{" "}
					<Link to="/fi/privacy">tietosuojaselosteessa</Link>. Voit myös{" "}
					<Link to="/fi/contact">ottaa yhteyttä</Link> osoitteeseen{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>
		</LegalDoc>
	);
}
