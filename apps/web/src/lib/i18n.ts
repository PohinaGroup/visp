import { useLocation } from "@tanstack/react-router";
import { defineI18n } from "fumadocs-core/i18n";

export type Locale = "en" | "fi";

export const contentI18n = defineI18n({
	defaultLanguage: "en",
	languages: ["en", "fi"],
	hideLocale: "default-locale",
});

export function useLocale(): Locale {
	return useLocation({
		select: (location) =>
			location.pathname === "/fi" ||
			location.pathname.startsWith("/fi/") ||
			new URLSearchParams(location.searchStr).get("lang") === "fi"
				? "fi"
				: "en",
	});
}

export function localeSearch(locale: Locale) {
	return locale === "fi" ? { lang: "fi" as const } : {};
}

const finnishUi: Record<string, string> = {
	Dashboard: "Hallintapaneeli",
	"Dashboard detail level": "Hallintapaneelin tarkkuustaso",
	Simple: "Yksinkertainen",
	Advanced: "Edistynyt",
	"Live signal path": "Suora signaalipolku",
	"Devices publish to the relay, OBS reads the feeds, you go on air. Your provider stream key never enters VISP.":
		"Laitteet julkaisevat relaylle, OBS lukee syötteet ja sinä aloitat lähetyksen. Palveluntarjoajasi lähetysavain ei koskaan siirry VISPille.",
	"Video sources": "Videolähteet",
	"No publishing devices": "Ei julkaisulaitteita",
	"Create a device for your first video source.":
		"Luo laite ensimmäiselle videolähteellesi.",
	"Device name": "Laitteen nimi",
	"Main phone": "Pääpuhelin",
	"Add device": "Lisää laite",
	"Publishing device created": "Julkaisulaite luotu",
	"See how to add a video source": "Katso videolähteen lisäämisohje",
	"Redo setup": "Tee käyttöönotto uudelleen",
	"Sending URL": "Lähetysosoite",
	"Receiving URL": "Vastaanotto-osoite",
	"OBS read URL": "OBS-lukuosoite",
	"Add this to video source": "Lisää tämä videolähteeseen",
	"Add this to OBS or other streaming software":
		"Lisää tämä OBS:ään tai muuhun lähetysohjelmaan",
	Dismiss: "Sulje",
	Save: "Tallenna",
	Revoke: "Peruuta",
	Live: "Suora",
	Offline: "Ei yhteyttä",
	"Status unknown": "Tila ei ole tiedossa",
	OBS: "OBS",
	"Plugin pairing": "Lisäosan yhdistäminen",
	"OBS pairing token": "OBS-yhdistämistunnus",
	"Download plugin config": "Lataa lisäosan määritys",
	"OBS read credentials": "OBS-lukutunnukset",
	"Read secret": "Lukusalaisuus",
	"OBS URL": "OBS-osoite",
	"Reveal read URLs": "Näytä lukuosoitteet",
	"Rotate read": "Vaihda lukutunnus",
	"Generate OBS credentials": "Luo OBS-tunnukset",
	"Generate read credentials to receive your device feeds in OBS.":
		"Luo lukutunnukset, jotta voit vastaanottaa laitteidesi syötteet OBS:ssä.",
	"Reveal your read URLs anytime — one per device, including newly added ones. Rotating replaces the secret and breaks existing OBS sources.":
		"Voit näyttää lukuosoitteet milloin tahansa. Jokaisella laitteella, myös uusilla, on oma osoite. Tunnuksen vaihtaminen korvaa salaisuuden ja katkaisee nykyiset OBS-lähteet.",
	"Read credentials from before revealing was supported can only be replaced. Rotate once to make them revealable.":
		"Ennen näyttötoimintoa luodut lukutunnukset voidaan vain korvata. Vaihda ne kerran, jotta ne voidaan näyttää.",
	"Download OBS collection": "Lataa OBS-kokoelma",
	Configured: "Määritetty",
	"Setup required": "Käyttöönotto vaaditaan",
	"Chat connections": "Chat-yhteydet",
	"Chat on": "Chat käytössä",
	Sources: "Lähteet",
	"No devices": "Ei laitteita",
	live: "suorana",
	Relay: "Välitys",
	"Keys set": "Avaimet asetettu",
	"Setup needed": "Määritys tarvitaan",
	Connected: "Yhdistetty",
	Disconnected: "Ei yhteyttä",
	"Not connected": "Ei yhdistetty",
	Output: "Lähtö",
	"On air": "Lähetyksessä",
	"Off air": "Ei lähetyksessä",
	"Not paired": "Ei yhdistetty",
	"Signal path": "Signaalipolku",
	"OBS pairing token created": "OBS-yhdistämistunnus luotu",
	"See how to pair the OBS plugin": "Katso OBS-lisäosan yhdistämisohje",
	"The OBS plugin is live in beta": "OBS-lisäosa on saatavilla beetaversiona.",
	"Download the plugin": "Lataa lisäosa",
	"OBS is not paired yet. Open plugin pairing below to connect it.":
		"OBS:ää ei ole vielä yhdistetty. Avaa alta lisäosan yhdistäminen.",
	"OBS has not acknowledged the latest command yet.":
		"OBS ei ole vielä vahvistanut viimeisintä komentoa.",
	"OBS reports that the stream is live.":
		"OBS ilmoittaa lähetyksen olevan suorana.",
	"OBS reports that the stream is stopped.":
		"OBS ilmoittaa lähetyksen olevan pysäytetty.",
	"Install the beta plugin from the download page, then in OBS open Tools → VISP Remote Control and click Sign in with browser. Approve the code here, and the dashboard shows Connected within a few seconds.":
		"Asenna beetalisäosa lataussivulta. Avaa sitten OBS:ssä Työkalut → VISP Remote Control ja valitse selaimella kirjautuminen. Hyväksy koodi täällä, minkä jälkeen yhteys näkyy hallintapaneelissa muutamassa sekunnissa.",
	"Rotate pairing token": "Vaihda yhdistämistunnus",
	"Generate pairing token": "Luo yhdistämistunnus",
	"Replace the current OBS pairing token?":
		"Korvataanko nykyinen OBS-yhdistämistunnus?",
	"Stop OBS stream": "Pysäytä OBS-lähetys",
	"Start OBS stream": "Aloita OBS-lähetys",
	Link: "Yhdistä",
	Unlink: "Poista yhteys",
	"Enable chat": "Ota chat käyttöön",
	"Authorize chat": "Valtuuta chat",
	"Disable chat": "Poista chat käytöstä",
	"Chat enabled": "Chat otettu käyttöön",
	"Chat disabled": "Chat poistettu käytöstä",
	unlinked: "poistettu käytöstä",
	"See how chat works in the phone and browser app":
		"Katso, miten chat toimii puhelin- ja selainsovelluksessa",
	"Link either provider for login, then opt into its read-only live chat separately.":
		"Yhdistä jompikumpi palvelu kirjautumista varten ja ota sen vain luku -muotoinen live-chat käyttöön erikseen.",
	Linked: "Yhdistetty",
	"Not linked": "Ei yhdistetty",
	"Messages can appear in VISP Native.":
		"Viestit voivat näkyä VISP Native -sovelluksessa.",
	"Chat is disabled.": "Chat ei ole käytössä.",
	"Disabling chat keeps the provider available for sign-in. At least one login must remain linked.":
		"Chatin poistaminen käytöstä säilyttää palvelun kirjautumistapana. Vähintään yhden kirjautumistavan on pysyttävä yhdistettynä.",
	"Connection guidance": "Yhteyssuositus",
	"Network profile": "Verkkoprofiili",
	"Estimated RTT (ms)": "Arvioitu RTT (ms)",
	"Use the relay probe or enter a measured value.":
		"Käytä relay-mittausta tai syötä mitattu arvo.",
	"Measure relay RTT": "Mittaa relayn RTT",
	"Use manual RTT": "Käytä syötettyä RTT:tä",
	"OBS and scene switcher setup": "OBS:n ja kohtausvaihtajan käyttöönotto",
	Back: "Takaisin",
	Next: "Seuraava",
	"Finish setup": "Viimeistele käyttöönotto",
	"Let's get you streaming": "Aloitetaan lähettäminen",
	"Setup mode": "Käyttöönottotila",
	"What do you want VISP for?": "Mihin haluat käyttää VISPiä?",
	"How will you send video?": "Miten lähetät videon?",
	"Where do you go live?": "Missä lähetät suorana?",
	"Test your connection": "Testaa yhteys",
	"Connection looks good": "Yhteys toimii",
	"No live feed yet": "Suoraa syötettä ei vielä ole",
	"On your phone": "Puhelimessa",
	"In your browser": "Selaimessa",
	"On your publishing device": "Julkaisevassa laitteessa",
	"On your streaming PC (OBS)": "Lähetyskoneella (OBS)",
	"By hand": "Käsin",
	"Publish link": "Julkaisuosoite",
	"Media source URL": "Medialähteen osoite",
	"Download the scene file": "Lataa kohtaustiedosto",
	"Download OBS scene file": "Lataa OBS-kohtaustiedosto",
	"Check for a live connection": "Tarkista suora yhteys",
};

export function useT() {
	const locale = useLocale();
	return (english: string) =>
		locale === "fi" ? (finnishUi[english] ?? english) : english;
}

const siteUrl = "https://visp-stream.com";

export function localizedHead(locale: Locale, path = "/") {
	const englishPath = path.replace(/^\/fi(?=\/|$)/, "") || "/";
	const finnishPath = englishPath === "/" ? "/fi" : `/fi${englishPath}`;
	const canonicalPath = locale === "fi" ? finnishPath : englishPath;
	return [
		{ rel: "canonical", href: `${siteUrl}${canonicalPath}` },
		{ rel: "alternate", hreflang: "en", href: `${siteUrl}${englishPath}` },
		{ rel: "alternate", hreflang: "fi", href: `${siteUrl}${finnishPath}` },
		{
			rel: "alternate",
			hreflang: "x-default",
			href: `${siteUrl}${englishPath}`,
		},
	];
}
