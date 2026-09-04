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
	"Cloud Studio": "Cloud Studio",
	"Build the saved program that Direct sends to your platforms.":
		"Rakenna tallennettu ohjelma, jonka Direct lähettää alustoillesi.",
	"Open Studio": "Avaa Studio",
	"Studio actions": "Studion toiminnot",
	"Studio saved": "Studio tallennettu",
	"Save composition": "Tallenna sommittelu",
	"Production mode updated": "Tuotantotila päivitetty",
	"Go Live": "Aloita lähetys",
	"Empty Cloud Studio": "Tyhjä Cloud Studio",
	"Your studio has no sources yet. Go live anyway?":
		"Studiossasi ei ole vielä lähteitä. Aloitetaanko lähetys silti?",
	Continue: "Jatka",
	"Don't ask again": "Älä kysy uudelleen",
	Failed: "Epäonnistui",
	"Preview unavailable": "Esikatselu ei ole käytettävissä",
	"Loading preview…": "Esikatselua ladataan…",
	"Preview failed": "Esikatselu epäonnistui",
	"Direct production mode": "Direct-tuotantotila",
	"I use OBS": "Käytän OBS:ää",
	"Switch production mode while live?":
		"Vaihdetaanko tuotantotilaa suoran lähetyksen aikana?",
	Scenes: "Näkymät",
	"Add scene": "Lisää näkymä",
	"Scene limit reached (3)": "Näkymäraja täynnä (3)",
	"Scene name": "Näkymän nimi",
	"Delete scene": "Poista näkymä",
	Inspector: "Tarkastin",
	"Source name": "Lähteen nimi",
	Visible: "Näkyvissä",
	Text: "Teksti",
	"Browser URL": "Selainosoite",
	"Browser source must be a public HTTPS URL":
		"Selainlähteen on oltava julkinen HTTPS-osoite",
	Transition: "Siirtymä",
	Cut: "Leikkaus",
	Fade: "Häivytys",
	"Select a source to edit it": "Valitse muokattava lähde",
	"Cloud Studio unavailable — showing camera only":
		"Cloud Studio ei ole käytettävissä — näytetään vain kamera",
	"You are offline — saved program stays live":
		"Verkkoyhteys puuttuu — tallennettu ohjelma pysyy suorana",
	"Saved composition applied": "Tallennettu sommittelu otettiin käyttöön",
	"Camera ingest": "Kamerasyöte",
	"Preview loads independently": "Esikatselu latautuu itsenäisesti",
	Program: "Ohjelma",
	"Last saved program preview": "Viimeksi tallennetun ohjelman esikatselu",
	"Add a source to build your program": "Lisää lähde rakentaaksesi ohjelmasi",
	"Text, PNG, browser, and VISP alerts are available.":
		"Käytettävissä ovat teksti, PNG, selain ja VISP-hälytykset.",
	"Add source": "Lisää lähde",
	"PNG, up to 10 MB.": "PNG, enintään 10 Mt.",
	"PNG overlay": "PNG-päällys",
	"Replace PNG": "Vaihda PNG",
	"Browser source": "Selainlähde",
	"VISP alert": "VISP-hälytys",
	"Alert event": "Hälytystapahtuma",
	follow: "uusi seuraaja",
	sub: "tilaus",
	donation: "lahjoitus",
	"X position": "X-sijainti",
	"Y position": "Y-sijainti",
	Width: "Leveys",
	Height: "Korkeus",
	"Move forward": "Siirrä eteen",
	"Move backward": "Siirrä taakse",
	"Delete source": "Poista lähde",
	"Composition canvas": "Sommittelukangas",
	"Edit source": "Muokkaa lähdettä",
	Cancel: "Peruuta",
	"Save changes before leaving?": "Tallennetaanko muutokset ennen poistumista?",
	"Unsaved Studio changes": "Tallentamattomia Studio-muutoksia",
	"Save your changes before leaving?":
		"Tallennetaanko muutokset ennen poistumista?",
	Discard: "Hylkää",
	"Loading Studio…": "Ladataan Studiota…",
	"Cloud Studio is not available yet":
		"Cloud Studio ei ole vielä käytettävissä",
	"Browser source limit reached (2)": "Selainlähteiden raja täynnä (2)",
	"Alert layer limit reached (1)": "Hälytystasojen raja täynnä (1)",
	"Layer limit reached (8)": "Tasoraja täynnä (8)",
	"Source could not be added": "Lähdettä ei voitu lisätä",
	LIVE: "LIVE",
	text: "teksti",
	png: "PNG",
	browser: "selain",
	alert: "hälytys",
	Dashboard: "Hallintapaneeli",
	Settings: "Asetukset",
	"Show day": "Lähetyspäivä",
	"Setup and controls": "Käyttöönotto ja hallinta",
	"Almost ready": "Melkein valmis",
	"Preview appears when you go live from the app.":
		"Esikatselu näkyy, kun aloitat lähetyksen sovelluksesta.",
	"Your stream is on air.": "Lähetyksesi on suorana.",
	"Everything is ready for your next stream.":
		"Kaikki on valmista seuraavaa lähetystä varten.",
	"Finish the next step below.": "Tee seuraava vaihe alta.",
	"Connect a platform": "Yhdistä alusta",
	"Get the VISP app": "Hanki VISP-sovellus",
	"Open the app to go live": "Avaa sovellus ja aloita lähetys",
	"Next step": "Seuraava vaihe",
	"Authorize Twitch, Kick, or YouTube before show day.":
		"Valtuuta Twitch, Kick tai YouTube ennen lähetyspäivää.",
	"Install VISP and add this phone as a publishing device.":
		"Asenna VISP ja lisää tämä puhelin julkaisulaitteeksi.",
	"Pair the VISP plugin with OBS before you stream.":
		"Yhdistä VISP-lisäosa OBS:ään ennen lähetystä.",
	"Back to dashboard": "Takaisin hallintapaneeliin",
	"Publishing path": "Julkaisupolku",
	"Where your phone sends video": "Minne puhelin lähettää videon",
	"Phone to platform": "Puhelimesta alustalle",
	"Phone to your OBS": "Puhelimesta omaan OBS:ään",
	Destinations: "Kohteet",
	"Dashboard detail level": "Hallintapaneelin tarkkuustaso",
	"Primary operational mode": "Ensisijainen toimintatila",
	"Primary mode": "Ensisijainen tila",
	"Direct to Platform": "Suoraan alustalle",
	"Custom destinations": "Mukautetut kohteet",
	"Save RTMP, RTMPS, or SRT endpoints here. Credentials stay hidden after saving.":
		"Tallenna RTMP-, RTMPS- tai SRT-kohteet tähän. Tunnukset piilotetaan tallennuksen jälkeen.",
	"Add custom destination": "Lisää mukautettu kohde",
	"Edit custom destination": "Muokkaa mukautettua kohdetta",
	"No custom destinations saved": "Mukautettuja kohteita ei ole tallennettu",
	"Destination name": "Kohteen nimi",
	"Destination URL": "Kohteen URL-osoite",
	"Replacement URL (optional)": "Korvaava URL-osoite (valinnainen)",
	"Current endpoint": "Nykyinen kohdeosoite",
	"Only the protocol, host, and explicit port are shown after saving.":
		"Tallennuksen jälkeen näytetään vain protokolla, palvelin ja erikseen määritetty portti.",
	"Save destination": "Tallenna kohde",
	"Custom destination saved": "Mukautettu kohde tallennettu",
	"Custom destination deleted": "Mukautettu kohde poistettu",
	Edit: "Muokkaa",
	Delete: "Poista",
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
	"Save framing": "Tallenna rajaus",
	"Portrait framing saved": "Pystyrajaus tallennettu",
	stopping: "pysäytetään",
	"Portrait uses an extra Direct slot. It will not start until a slot is free.":
		"Pystylähtö käyttää erillisen Direct-paikan. Se ei käynnisty ennen kuin paikka vapautuu.",
	"Couldn’t save framing. Check your connection and retry.":
		"Rajauksen tallennus epäonnistui. Tarkista yhteys ja yritä uudelleen.",
	"Route to Home Studio": "Reititä kotistudioon",
	"Advanced setup": "Edistynyt käyttöönotto",
	"Change publishing path": "Vaihda julkaisupolkua",
	"Primary mode saved": "Ensisijainen tila tallennettu",
	"Choose one primary publishing path. Direct sends the feed to a platform; Home Studio sends it to OBS, which owns the platform output.":
		"Valitse yksi ensisijainen julkaisupolku. Direct lähettää syötteen alustalle; kotistudiotilassa syöte menee OBS:ään, joka vastaa alustalähdöstä.",
	"Select where the final stream is produced. These modes are separate and cannot run as one output path.":
		"Valitse, missä lopullinen lähetys tuotetaan. Tilat ovat erillisiä, eikä niitä voi käyttää yhtenä lähtöpolkuna.",
	"Switch to Route to Home Studio? This turns off every Direct platform output.":
		"Vaihdetaanko kotistudioreititykseen? Tämä poistaa kaikki Direct-alustalähdöt käytöstä.",
	"Open Advanced setup to turn off Direct output":
		"Poista Direct-lähtö käytöstä avaamalla edistynyt käyttöönotto",
	Simple: "Yksinkertainen",
	Advanced: "Edistynyt",
	"Live signal path": "Suora signaalipolku",
	"Pre-flight passed": "Ennakkotarkistus läpäisty",
	"Authorization, ownership, and relay capacity checked before Go Live.":
		"Valtuutus, omistajuus ja relayn kapasiteetti tarkistettiin ennen lähetyksen aloitusta.",
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
	"Update failed": "Päivitys epäonnistui",
	"Studio layer pixel budget exceeded": "Studion tasojen pikseliraja ylittyi",
	"Studio crossfade pixel budget exceeded":
		"Studion ristihäivytyksen pikseliraja ylittyi",
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
	"BRB screen": "BRB-kortti",
	Chat: "Chat",
	"Where your stream goes": "Minne lähetyksesi menee",
	"Pick one. Direct sends the feed to a platform; Home Studio sends it to OBS, which owns the platform output.":
		"Valitse yksi. Direct lähettää syötteen alustalle; kotistudio lähettää sen OBS:ään, joka vastaa alustalähdöstä.",
	"OBS connected": "OBS yhdistetty",
	"OBS streaming": "OBS lähettää",
	"Pair OBS": "Yhdistä OBS",
	"Showing BRB card": "Näyttää BRB-korttia",
	"Show RTMP and SRTLA fallback URLs": "Näytä RTMP- ja SRTLA-vara-osoitteet",
	"SRT is the default. Turn this on if your network blocks UDP, or if you bond several connections with SRTLA.":
		"SRT on oletus. Ota tämä käyttöön, jos verkkosi estää UDP:n tai jos yhdistät useita yhteyksiä SRTLA:lla.",
	"Offers wipe or keep existing devices.":
		"Voit joko tyhjentää tai säilyttää nykyiset laitteet.",
	"Using OBS alongside Direct": "OBS:n käyttö Directin rinnalla",
	Tuning: "Viritys",
	Reference: "Ohjeet",
	"Relay to OBS": "Välitys OBS:ään",
	"Recommended SRT latency for your connection":
		"Suositeltu SRT-viive yhteydellesi",
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
	"1. Build a scene below. 2. Save the composition. 3. Go live from the VISP app — the saved program is what viewers see.":
		"1. Rakenna näkymä alla. 2. Tallenna sommittelu. 3. Aloita lähetys VISP-sovelluksesta — katsojat näkevät tallennetun ohjelman.",
	"A line of text — show title, topic, or a handle.":
		"Tekstirivi — otsikko, aihe tai käyttäjänimi.",
	"A scene is one arrangement of sources. Switch between them while live.":
		"Näkymä on yksi lähteiden asettelu. Voit vaihtaa näkymää kesken lähetyksen.",
	"Any public https:// page — a widget, a timer, a chat overlay.":
		"Mikä tahansa julkinen https://-sivu — widget, ajastin tai chat-päällys.",
	"Applies this composition to your saved program.":
		"Ottaa tämän sommittelun käyttöön tallennetussa ohjelmassa.",
	"Back to paths, platforms, and stream keys.":
		"Takaisin polkuihin, alustoihin ja lähetysavaimiin.",
	"Can't reach VISP — editing is paused":
		"VISP ei vastaa — muokkaus on keskeytetty",
	"Cloud Studio allows up to 3 scenes.":
		"Cloud Studiossa voi olla enintään 3 näkymää.",
	"Cloud Studio mode: VISP composes the scenes below onto your camera and sends the result to your platforms.":
		"Cloud Studio -tila: VISP yhdistää alla olevat näkymät kamerakuvaasi ja lähettää lopputuloksen alustoillesi.",
	"Composition preview": "Sommittelun esikatselu",
	"Compositor offline — camera passes through":
		"Kuvamiksaus pois päältä — kamera menee läpi sellaisenaan",
	"Connecting to the stream…": "Yhdistetään lähetykseen…",
	"Cut: instant switch into this scene.":
		"Leikkaus: vaihtaa tähän näkymään välittömästi.",
	"Delete a browser source before adding another. Cloud Studio allows 2 in total.":
		"Poista selainlähde ennen uuden lisäämistä. Cloud Studiossa niitä voi olla 2.",
	"Delete a scene before adding another. Cloud Studio allows 3.":
		"Poista näkymä ennen uuden lisäämistä. Cloud Studiossa niitä voi olla 3.",
	"Draw this source behind the one below it.":
		"Piirrä tämä lähde alapuolellaan olevan taakse.",
	"Draw this source on top of the one above it.":
		"Piirrä tämä lähde yläpuolellaan olevan päälle.",
	"Edit this scene.": "Muokkaa tätä näkymää.",
	"Editing is paused until VISP is reachable again.":
		"Muokkaus jatkuu, kun yhteys VISPiin palaa.",
	"Editing preview — drag a source to move it, or select it and nudge with the arrow keys. Sizes and exact positions are on the right.":
		"Muokkausnäkymä — siirrä lähdettä raahaamalla tai valitse se ja siirrä nuolinäppäimillä. Koot ja tarkat sijainnit ovat oikealla.",
	"Empty text": "Tyhjä teksti",
	"Every source is drawn on top of your camera, in the order shown in the scene list.":
		"Jokainen lähde piirretään kamerakuvan päälle näkymälistan järjestyksessä.",
	"Fade renders two scenes at once. Shrink a source, or set this scene to Cut.":
		"Häivytys piirtää kaksi näkymää yhtä aikaa. Pienennä lähdettä tai vaihda tämä näkymä leikkaukseen.",
	"Fade: half-second blend. Uses more of the frame budget than Cut.":
		"Häivytys: puolen sekunnin sulautus. Vie enemmän kuvabudjettia kuin leikkaus.",
	"Finish setup on the dashboard to get a publish target.":
		"Viimeistele käyttöönotto hallintapaneelissa, niin saat julkaisukohteen.",
	"Fix the highlighted sources before saving.":
		"Korjaa merkityt lähteet ennen tallennusta.",
	"Fix these sources before saving": "Korjaa nämä lähteet ennen tallennusta",
	Hidden: "Piilotettu",
	"Hidden sources stay in the scene but are not rendered.":
		"Piilotettu lähde pysyy näkymässä mutta ei näy lähetyksessä.",
	"Needs fixing": "Vaatii korjausta",
	"No sources in this scene yet": "Tässä näkymässä ei ole vielä lähteitä",
	"No stream path yet": "Lähetyspolkua ei ole vielä",
	"Nothing is streaming right now": "Mitään ei lähetetä juuri nyt",
	"Nothing selected. Click a source in the preview or the list to edit it.":
		"Mitään ei ole valittuna. Valitse lähde esikatselusta tai listasta.",
	"Nothing to save — every change is already applied.":
		"Ei tallennettavaa — kaikki muutokset ovat jo käytössä.",
	"OBS mode: your own software composes the picture. VISP passes your feed through untouched and ignores the scenes below.":
		"OBS-tila: oma ohjelmistosi rakentaa kuvan. VISP välittää syötteen sellaisenaan eikä käytä alla olevia näkymiä.",
	"On air in the saved program.": "Lähetyksessä tallennetussa ohjelmassa.",
	"Only you see scene names.": "Näkymien nimet näkyvät vain sinulle.",
	"Only you see source names.": "Lähteiden nimet näkyvät vain sinulle.",
	"Opens the VISP broadcast page. Save first — only the saved composition goes on air.":
		"Avaa VISPin lähetyssivun. Tallenna ensin — vain tallennettu sommittelu menee lähetykseen.",
	"PNG could not be loaded": "PNG-kuvaa ei voitu ladata",
	"PNG, up to 10 MB. Transparency is kept, so logos and frames work.":
		"PNG, enintään 10 Mt. Läpinäkyvyys säilyy, joten logot ja kehykset toimivat.",
	"Pick what to place on top of your camera.":
		"Valitse, mitä asetat kamerakuvan päälle.",
	"Pops up on a follow, sub, or donation. One alert source covers every event.":
		"Ponnahtaa näkyviin uudesta seuraajasta, tilauksesta tai lahjoituksesta. Yksi hälytyslähde kattaa kaikki tapahtumat.",
	"Position and size in pixels. The frame is 1920 × 1080. You can also drag the source in the preview.":
		"Sijainti ja koko pikseleinä. Kuva-ala on 1920 × 1080. Voit myös raahata lähdettä esikatselussa.",
	"Move source": "Siirrä lähdettä",
	"Some sites refuse to be embedded, so this box can look empty here even though the compositor renders it on air.":
		"Osa sivustoista estää upottamisen, joten tämä laatikko voi näyttää tyhjältä täällä, vaikka kuvamiksaus näyttää sen lähetyksessä.",
	"Preview could not connect": "Esikatselu ei saanut yhteyttä",
	"Previews need a connection. Anything already saved keeps streaming.":
		"Esikatselu vaatii verkkoyhteyden. Jo tallennettu jatkaa lähetystä.",
	"Reconnect to keep editing. Changes made offline are not saved.":
		"Yhdistä uudelleen jatkaaksesi muokkausta. Ilman yhteyttä tehtyjä muutoksia ei tallenneta.",
	"Removes it from this scene. Saving makes it final.":
		"Poistaa lähteen tästä näkymästä. Tallennus vahvistaa poiston.",
	"Removes this scene and its sources.":
		"Poistaa tämän näkymän ja sen lähteet.",
	"Renders any public https:// page — widgets, timers, chat overlays.":
		"Näyttää minkä tahansa julkisen https://-sivun — widgetit, ajastimet, chat-päällykset.",
	"Retry now": "Yritä uudelleen",
	"Retry preview": "Yritä esikatselua uudelleen",
	"Shown on screen exactly as typed.":
		"Näkyy ruudulla juuri kirjoitetussa muodossa.",
	"Shows only when the event fires": "Näkyy vain, kun tapahtuma laukeaa",
	"Sources cover too much of the frame. Make one smaller or hide it, then try again.":
		"Lähteet peittävät liian suuren osan kuvasta. Pienennä tai piilota yksi ja yritä uudelleen.",
	"Sources in this scene": "Lähteitä tässä näkymässä",
	"Sources stack on top of your camera: text, a PNG overlay, any public web page, or a VISP alert. You can arrange them here without being live.":
		"Lähteet asettuvat kamerakuvan päälle: teksti, PNG-päällys, mikä tahansa julkinen verkkosivu tai VISP-hälytys. Voit järjestellä ne täällä ilman lähetystä.",
	"Sources, front to back": "Lähteet edestä taakse",
	"Start publishing from the VISP app or OBS. This preview appears within a few seconds.":
		"Aloita lähetys VISP-sovelluksesta tai OBS:stä. Esikatselu ilmestyy muutamassa sekunnissa.",
	"Studio saved — it is live on your next scene change":
		"Studio tallennettu — käytössä seuraavassa näkymänvaihdossa",
	"Switch the mode above to Cloud Studio to put this composition on air.":
		"Vaihda tila yllä Cloud Studioksi, niin tämä sommittelu menee lähetykseen.",
	"Switching production mode changes what viewers see within seconds. Switch now?":
		"Tuotantotilan vaihto muuttaa katsojien näkemän kuvan sekunneissa. Vaihdetaanko nyt?",
	"Empty text renders nothing on screen.":
		"Tyhjä teksti ei näy ruudulla lainkaan.",
	"The alert only appears when this event fires on your platform.":
		"Hälytys näkyy vain, kun tämä tapahtuma laukeaa alustallasi.",
	"The compositor is down, so viewers see your plain camera. Your overlays return automatically when it recovers.":
		"Kuvamiksaus on pois käytöstä, joten katsojat näkevät pelkän kamerakuvan. Päällykset palaavat automaattisesti.",
	"The program feed appears once Cloud Studio has a path.":
		"Ohjelmasyöte näkyy, kun Cloud Studiolla on polku.",
	"The stream is still going out. Only this browser preview failed — check your network, then retry.":
		"Lähetys jatkuu normaalisti. Vain tämä selaimen esikatselu epäonnistui — tarkista verkkoyhteys ja yritä uudelleen.",
	"This scene is full. Delete a source before adding another. Each scene allows 8.":
		"Näkymä on täynnä. Poista lähde ennen uuden lisäämistä. Yhdessä näkymässä voi olla 8.",
	"This source failed at runtime. Turning it on retries it.":
		"Tämä lähde epäonnistui lähetyksessä. Kytkeminen päälle yrittää uudelleen.",
	"This studio has no saved sources, so viewers will see your plain camera. Go live anyway?":
		"Studiossa ei ole tallennettuja lähteitä, joten katsojat näkevät pelkän kamerakuvan. Aloitetaanko lähetys silti?",
	"This usually takes a few seconds.": "Tämä kestää yleensä muutaman sekunnin.",
	"Unsaved changes": "Tallentamattomia muutoksia",
	"Unsaved changes are not on air. Save them before leaving?":
		"Tallentamattomat muutokset eivät ole lähetyksessä. Tallennetaanko ne ennen poistumista?",
	"Use an https:// address that opens in a normal browser tab, with no username or password in it.":
		"Käytä https://-osoitetta, joka aukeaa tavallisessa selainvälilehdessä ilman käyttäjänimeä tai salasanaa.",
	"Waiting for the live picture": "Odotetaan live-kuvaa",
	"What your camera sends into VISP, before overlays.":
		"Mitä kamerasi lähettää VISPiin ennen päällyksiä.",
	"What your viewers see: camera plus your saved sources.":
		"Mitä katsojat näkevät: kamera ja tallennetut lähteesi.",
	"You already have a VISP alert. One alert source covers every event.":
		"Sinulla on jo VISP-hälytys. Yksi hälytyslähde kattaa kaikki tapahtumat.",
	"You are in OBS mode — these scenes are not on air":
		"Olet OBS-tilassa — nämä näkymät eivät ole lähetyksessä",
	"You are offline": "Verkkoyhteys puuttuu",
	"Your account is streaming through Direct as usual. We will enable Cloud Studio here when it reaches your plan.":
		"Tilisi lähettää Directin kautta normaalisti. Cloud Studio avautuu tänne, kun se tulee tilaukseesi.",
	"Your camera fills this frame underneath":
		"Kamerakuvasi täyttää tämän kuva-alan alla",
	"Your program needs at least one scene.":
		"Ohjelmassa on oltava vähintään yksi näkymä.",
	"Your saved program keeps streaming. This page retries on its own; nothing you already saved is lost.":
		"Tallennettu ohjelmasi jatkaa lähetystä. Sivu yrittää yhteyttä automaattisesti eikä tallennettu katoa.",
	"Your stream is still going out. Only this browser preview has no picture.":
		"Lähetyksesi jatkuu normaalisti. Vain tässä selaimen esikatselussa ei ole kuvaa.",
	"Your stream keeps going out as the plain camera. Overlays return automatically.":
		"Lähetys jatkuu pelkkänä kamerakuvana. Päällykset palaavat automaattisesti.",
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
