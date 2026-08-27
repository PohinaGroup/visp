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
	"Primary operational mode": "Ensisijainen toimintatila",
	"Primary mode": "Ensisijainen tila",
	"Direct to Platform": "Suoraan alustalle",
	"Add portrait output": "Lisää pystylähtö",
	"Edit framing": "Muokkaa rajausta",
	Portrait: "Pysty",
	Landscape: "Vaaka",
	"Remove portrait": "Poista pystylähtö",
	"Frame portrait output": "Rajaa pystylähtö",
	"Landscape contribution preview": "Vaakasuuntaisen syötteen esikatselu",
	"Portrait crop preview": "Pystyrajauksen esikatselu",
	"Resize portrait crop": "Muuta pystyrajauksen kokoa",
	"Preview appears while this device is publishing":
		"Esikatselu näkyy, kun tämä laite julkaisee",
	"Adjust the crop so it stays within the frame and matches 9:16.":
		"Säädä rajaus kuvan sisään ja 9:16-kuvasuhteeseen.",
	"Simulated portrait output": "Pystylähdön esikatselu",
	"Horizontal crop position": "Rajauksen vaakasijainti",
	"Vertical crop position": "Rajauksen pystysijainti",
	"Crop size": "Rajauksen koko",
	Cancel: "Peruuta",
	"Save framing": "Tallenna rajaus",
	"Portrait framing saved": "Pystyrajaus tallennettu",
	stopping: "pysäytetään",
	"Portrait uses an extra Direct slot. It will not start until a slot is free.":
		"Pystylähtö käyttää erillisen Direct-paikan. Se ei käynnisty ennen kuin paikka vapautuu.",
	"Couldn’t save framing. Check your connection and retry.":
		"Rajauksen tallennus epäonnistui. Tarkista yhteys ja yritä uudelleen.",
	"Route to Home Studio": "Reititä kotistudioon",
	"Primary mode saved": "Ensisijainen tila tallennettu",
	"Choose one primary publishing path. Direct sends the feed to a platform; Home Studio sends it to OBS, which owns the platform output.":
		"Valitse yksi ensisijainen julkaisupolku. Direct lähettää syötteen alustalle; kotistudiotilassa syöte menee OBS:ään, joka vastaa alustalähdöstä.",
	"Select where the final stream is produced. These modes are separate and cannot run as one output path.":
		"Valitse, missä lopullinen lähetys tuotetaan. Tilat ovat erillisiä, eikä niitä voi käyttää yhtenä lähtöpolkuna.",
	"Switch to Route to Home Studio? This turns off every Direct platform output.":
		"Vaihdetaanko kotistudioreititykseen? Tämä poistaa kaikki Direct-alustalähdöt käytöstä.",
	"Choose Route to Home Studio above to turn off Direct output":
		"Poista Direct-lähtö käytöstä valitsemalla yllä Reititä kotistudioon",
	Simple: "Yksinkertainen",
	Advanced: "Edistynyt",
	"Live signal path": "Suora signaalipolku",
	"Devices publish to the relay, OBS reads the feeds, you go on air. Or send a device straight to a platform with Direct output.":
		"Laitteet julkaisevat relaylle, OBS lukee syötteet ja sinä aloitat lähetyksen. Tai lähetä laite suoraan alustalle Direct-lähdöllä.",
	"Devices publish to the relay and Direct sends them to Twitch or Kick. Add OBS afterward for monitoring, recording, or scenes.":
		"Laitteet julkaisevat relaylle ja Direct lähettää ne Twitchiin tai Kickiin. Lisää OBS myöhemmin valvontaa, tallennusta tai kohtauksia varten.",
	"Devices publish to the relay and Direct sends them to Twitch, Kick, or YouTube. Add OBS afterward for monitoring, recording, or scenes.":
		"Laitteet julkaisevat relaylle ja Direct lähettää ne Twitchiin, Kickiin tai YouTubeen. Lisää OBS myöhemmin valvontaa, tallennusta tai kohtauksia varten.",
	"Send a publishing device straight to Twitch, Kick, or YouTube without OBS. The relay encodes for each platform.":
		"Lähetä julkaisulaite suoraan Twitchiin, Kickiin tai YouTubeen ilman OBS:ää. Relay koodaa videon jokaiselle alustalle.",
	"Default YouTube broadcast title": "YouTube-lähetyksen oletusotsikko",
	"Save title": "Tallenna otsikko",
	"YouTube title saved": "YouTube-otsikko tallennettu",
	"YouTube broadcasts are public": "YouTube-lähetykset ovat julkisia",
	"VISP creates a new public YouTube broadcast when this device starts publishing.":
		"VISP luo uuden julkisen YouTube-lähetyksen, kun tämä laite aloittaa julkaisemisen.",
	"Never drop again": "Älä koskaan katkea",
	"When your ingest drops, VISP keeps the outgoing stream running and shows this card instead. Your hosts stay, and the VOD does not split.":
		"Kun syöte katkeaa, VISP pitää lähtevän lähetyksen käynnissä ja näyttää tämän kortin. Hostaukset säilyvät eikä tallenne katkea kahtia.",
	"Show a BRB card when my stream drops":
		"Näytä BRB-kortti, kun lähetys katkeaa",
	Message: "Viesti",
	"Save message": "Tallenna viesti",
	"BRB card saved": "BRB-kortti tallennettu",
	"BRB background": "BRB-tausta",
	"Latest snapshot": "Viimeisin kuva",
	"Custom image": "Oma kuva",
	"Solid black": "Musta tausta",
	"BRB image": "BRB-kuva",
	"PNG or JPEG, up to 5 MB.": "PNG tai JPEG, enintään 5 Mt.",
	"Remove image": "Poista kuva",
	"BRB image uploaded": "BRB-kuva ladattu",
	"BRB image removed": "BRB-kuva poistettu",
	"Use a PNG or JPEG image": "Käytä PNG- tai JPEG-kuvaa",
	"That image is over 5 MB": "Kuva on yli 5 Mt",
	"Upload failed, try again": "Lataus epäonnistui, yritä uudelleen",
	Highlights: "Kohokohdat",
	"Upload highlights": "Lataa kohokohtia",
	"Highlights will play on next BRB":
		"Kohokohdat toistetaan seuraavalla BRB:llä",
	"Still plays until you add clips":
		"Still-kuva toistetaan, kunnes lisäät klippejä",
	"Play clip audio": "Toista klipin ääni",
	"Show BRB message on highlights": "Näytä BRB-viesti kohokohdissa",
	"MP4 (H.264), up to 30 seconds and 25 MB. Max 5 clips.":
		"MP4 (H.264), enintään 30 sekuntia ja 25 Mt. Enintään 5 klippiä.",
	"That clip is over 30 seconds": "Klippi on yli 30 sekuntia",
	"That clip is over 25 MB": "Klippi on yli 25 Mt",
	"Use an MP4 (H.264) video": "Käytä MP4 (H.264) -videota",
	"Highlights library is full (5 clips)":
		"Kohokohtakirjasto on täynnä (5 klippiä)",
	"Played {n} highlights": "Toistettiin {n} kohokohtaa",
	"Highlights unavailable — showed still":
		"Kohokohdat eivät olleet saatavilla — näytettiin still-kuva",
	"Clip uploaded": "Klippi ladattu",
	"Clip removed": "Klippi poistettu",
	"Highlight order saved": "Kohokohtien järjestys tallennettu",
	"Move up": "Siirrä ylös",
	"Move down": "Siirrä alas",
	Rename: "Nimeä uudelleen",
	"Remove clip": "Poista klippi",
	Enabled: "Käytössä",
	"From your stream": "Lähetyksestäsi",
	ago: "sitten",
	"Your latest frame will be used once you have streamed once.":
		"Viimeisin kuva lähetyksestäsi otetaan käyttöön, kun olet lähettänyt kerran.",
	"BRB card": "BRB-kortti",
	"Your ingest dropped. Viewers see your BRB card.":
		"Syöte katkesi. Katsojat näkevät BRB-korttisi.",
	"End stream": "Lopeta lähetys",
	"Ending the stream": "Lopetetaan lähetys",
	"showing BRB card": "näyttää BRB-korttia",
	On: "Päällä",
	"Optional OBS source": "Valinnainen OBS-lähde",
	"Switch to Direct when you are ready": "Vaihda Directiin, kun olet valmis",
	"Your existing OBS workflow is unchanged. Authorize a destination and select it below when you are ready to switch to Direct.":
		"Nykyinen OBS-työnkulkusi ei muutu. Valtuuta kohde ja valitse se alta, kun olet valmis vaihtamaan Directiin.",
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
	Congested: "Tukkoinen",
	Degraded: "Vajaa yhteys",
	links: "yhteyttä",
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
	Receiving: "Vastaanottaa",
	Ready: "Valmis",
	"Choose output": "Valitse lähtö",
	"OBS only": "Vain OBS",
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
	"OBS chat overlay": "OBS-chatpäällys",
	"Add a Browser Source in OBS and paste this URL. It shows the chats you enabled above, on a transparent background. Append &corner=top-right, &rows=3, &fade=1, or &debug=1 to change it.":
		"Lisää OBS:ään Browser Source ja liitä tämä osoite. Se näyttää yllä käyttöön ottamasi chatit läpinäkyvällä taustalla. Voit muuttaa sitä lisäämällä &corner=top-right, &rows=3, &fade=1 tai &debug=1.",
	"Browser Source URL": "Browser Source -osoite",
	Preview: "Esikatselu",
	"Generate overlay URL": "Luo päällysosoite",
	"Rotate overlay URL": "Vaihda päällysosoite",
	"Revoke overlay URL": "Mitätöi päällysosoite",
	"Overlay URL created": "Päällysosoite luotu",
	"Overlay URL revoked": "Päällysosoite mitätöity",
	"Replace the overlay URL already pasted into OBS?":
		"Korvataanko OBS:ään jo liitetty päällysosoite?",
	"Stop the OBS chat overlay from loading?":
		"Estetäänkö OBS-chatpäällyksen lataus?",
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
	"Chat bot": "Chat-botti",
	"See what the chat bot posts and answers":
		"Katso mitä chat-botti kirjoittaa ja mihin se vastaa",
	"Posts to your chat when the stream goes live, drops, or comes back, and answers commands like !bitrate. Messages appear as your own account.":
		"Kirjoittaa chattiin kun lähetys alkaa, katkeaa tai palaa, ja vastaa komentoihin kuten !bitrate. Viestit näkyvät omalla tililläsi.",
	"Let VISP post in my chat": "Anna VISPin kirjoittaa chattiini",
	"Post on": "Kirjoita alustoille",
	"Send test": "Lähetä testiviesti",
	"test message sent": "testiviesti lähetetty",
	"posting is not authorized yet": "kirjoituslupaa ei ole vielä annettu",
	"Authorize posting": "Anna kirjoituslupa",
	"Could not authorize posting": "Kirjoitusluvan antaminen epäonnistui",
	"Say when the stream goes live": "Kerro kun lähetys alkaa",
	"Say when the signal drops": "Kerro kun signaali katkeaa",
	"Say when the signal comes back": "Kerro kun signaali palaa",
	"Say when the stream ends": "Kerro kun lähetys päättyy",
	"Answer chat commands": "Vastaa chat-komentoihin",
	"Wording and commands": "Sanamuodot ja komennot",
	"Placeholders: {device}, {uptime}, {downtime}. Leave a field empty to use the default wording.":
		"Muuttujat: {device}, {uptime}, {downtime}. Jätä kenttä tyhjäksi käyttääksesi oletustekstiä.",
	"Custom commands": "Omat komennot",
	"Add command": "Lisää komento",
	"Command saved": "Komento tallennettu",
	Command: "Komento",
	Reply: "Vastaus",
	Remove: "Poista",
	"Join at example.com/discord": "Liity: example.com/discord",
	"Built in: !bitrate, !uptime, !viewers, !commands, and !title for you and your mods.":
		"Valmiina: !bitrate, !uptime, !viewers, !commands sekä !title sinulle ja moderaattoreillesi.",
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
		{ rel: "alternate", hrefLang: "en", href: `${siteUrl}${englishPath}` },
		{ rel: "alternate", hrefLang: "fi", href: `${siteUrl}${finnishPath}` },
		{
			rel: "alternate",
			hrefLang: "x-default",
			href: `${siteUrl}${englishPath}`,
		},
	];
}

// The landing routes only ever set title/description/og:locale, so Google had
// no site-name signal and echoed the <title> verbatim above the URL in the
// SERP snippet. The root WebSite JSON-LD supplies the structured site identity;
// this og/twitter block also gives the homepage a link card.
export function landingHead(
	locale: Locale,
	title: string,
	description: string,
	faq?: readonly { q: string; a: string }[],
) {
	const canonical = `${siteUrl}${locale === "fi" ? "/fi" : "/"}`;
	// 1200x630, generated by scripts/gen-social-cards.py.
	const image = `${siteUrl}/og-card.png`;
	return {
		scripts: faq && [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "FAQPage",
					inLanguage: locale,
					mainEntity: faq.map((item) => ({
						"@type": "Question",
						name: item.q,
						acceptedAnswer: { "@type": "Answer", text: item.a },
					})),
				}),
			},
		],
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "VISP" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: canonical },
			{ property: "og:image", content: image },
			{ property: "og:image:width", content: "1200" },
			{ property: "og:image:height", content: "630" },
			{
				property: "og:image:alt",
				content:
					locale === "fi"
						? "VISP — livetä mistä tahansa. Signaaliketju lähteestä relayn ja Directin kautta ulos."
						: "VISP — go live from anywhere. The signal chain from source through relay and Direct to the platform.",
			},
			{ property: "og:locale", content: locale === "fi" ? "fi_FI" : "en_US" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			{ name: "twitter:image", content: image },
		],
		links: localizedHead(locale),
	};
}
