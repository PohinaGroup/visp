// Landing page copy, one object per locale. `fi` is typed as `typeof en`, so a
// key added to the English page fails the type check until Finnish has it too.
import { legalEntity } from "@/lib/legal";

export type LandingLink = {
	label: string;
	href: string;
	external: boolean;
	search?: { lang: "fi" };
};

type Step = { title: string; body: string };

const en = {
	meta: {
		title: "VISP — Stop Paying for Cloud OBS. Stream Your Phone into Your OBS",
		description:
			"Bring your phone camera into the OBS you already run and stop paying $120–180 a month for cloud OBS. No computer? Go Direct to Twitch, Kick, or YouTube. Free during beta.",
	},
	nav: [
		{ label: "Download", href: "/download", external: false },
		{ label: "Docs", href: legalEntity.docsUrl, external: true },
	] as LandingLink[],
	langSwitch: { label: "FI", href: "/fi", hrefLang: "fi" },
	tryCta: "Try VISP free",
	downloadLink: "Download the app",
	hero: {
		eyebrow: "Free during beta",
		title: "Stop paying for cloud OBS.",
		body: "Stream from your phone into the OBS you already run at home. Your scenes, overlays, alerts, and plugins keep working — without a $120–180 monthly bill.",
		note: "No ports to open · no stream key on your phone",
		videoLabel: "A VISP stream goes live and arrives in OBS",
		videoCaption: "REAL GO-LIVE · 8 SEC",
	},
	path: {
		label: "Signal path",
		studio: {
			tag: "Your OBS",
			nodes: ["Phone", "VISP relay", "Your OBS", "Twitch · Kick · YouTube"],
		},
		direct: {
			tag: "Direct",
			nodes: ["Phone", "VISP relay", "No computer", "Twitch · Kick · YouTube"],
		},
	},
	cost: {
		eyebrow: "The math",
		title: "Keep $1,440–$2,160 a year",
		body: "Unlimited cloud OBS plans in this comparison cost $120–180 a month. If you already have a computer that runs OBS, VISP brings the feed to it free during beta. If you need a managed cloud studio or true cellular bonding, a paid service can still be the right choice.",
		chartTitle: "12-month software cost",
		chartSubtitle: "When you already own a computer that can run OBS.",
		chartNote: "Excludes hardware, electricity, and internet service.",
		rows: [
			{ product: "VISP + your OBS", cost: "$0 during beta", width: "4%" },
			{ product: "IRLToolkit", cost: "$1,548–$2,148", width: "99.4%" },
			{ product: "Streamable.run", cost: "$1,440–$2,160", width: "100%" },
		],
		tableToggle: "See full comparison",
		tableCaption:
			"VISP compared with IRLToolkit, Streamable.run, IRLServer, and BELABOX",
		checked: "Public list prices, checked",
	},
	workflows: {
		eyebrow: "Two ways to go live",
		title: "Your studio, or no studio at all",
		studio: {
			tag: "VISP + your OBS",
			title: "Bring the phone into your studio",
			steps: [
				{
					title: "Install the plugin",
					body: "Install the VISP OBS plugin and sign in.",
				},
				{
					title: "Add the feed",
					body: "Add your authenticated phone feed to OBS as a source.",
				},
				{
					title: "Run the show",
					body: "Use your existing scenes, overlays, alerts, and local recording. Switch scenes from the phone.",
				},
			] as Step[],
			image: "/marketing/app-obs-control.jpg",
			imageAlt: "Switching the OBS program scene from the VISP app",
		},
		direct: {
			tag: "Direct",
			title: "Or skip the computer",
			steps: [
				{ title: "Sign in", body: "Sign in with Twitch, Kick, or Google." },
				{
					title: "Connect your platform",
					body: "Choose the Twitch, Kick, or YouTube channel where you stream.",
				},
				{
					title: "Go live",
					body: "Open the VISP app and start. No OBS and no stream key on the phone.",
				},
			] as Step[],
			image: "/marketing/app-live.jpg",
			imageAlt: "VISP app live stream screen",
		},
	},
	channels: {
		title: "Less uncertainty on air",
		items: [
			{
				tag: "LINK",
				title: "Stay live when one link drops",
				body: "The native app can duplicate packets over Wi-Fi and cellular, so a failure on one connection does not have to end the show.",
			},
			{
				tag: "KEY",
				title: "Keep stream keys off the phone",
				body: "Direct retrieves authorized destination credentials server-side. A lost or borrowed publishing device never receives your key.",
			},
			{
				tag: "CTRL",
				title: "Control OBS without opening ports",
				body: "Switch scenes and control your broadcast from the app without exposing an inbound control port on your studio computer.",
			},
			{
				tag: "CHECK",
				title: "Fail early, before viewers arrive",
				body: "VISP checks authorization, ownership, and relay capacity before accepting frames, while you can still fix the setup.",
			},
		],
	},
	faq: {
		eyebrow: "Frequently asked",
		title: "Questions before the beta",
		items: [
			{
				q: "Can VISP replace my cloud OBS subscription?",
				a: "Yes, if you already have a computer that can run OBS. VISP brings the remote phone or browser feed into your own OBS, where your existing scenes, overlays, alerts, and plugins keep working.",
			},
			{
				q: "How much can I save?",
				a: "Unlimited cloud OBS plans in this comparison cost $120–180 per month, or $1,440–$2,160 over 12 months. VISP is free during beta. Your hardware, electricity, and internet costs are separate.",
			},
			{
				q: "Do I have to paste a stream key into my phone?",
				a: "No. VISP fetches the authorized destination credentials only while starting the Direct output, and never returns them to the publishing device. A lost or borrowed phone does not leak your key.",
			},
			{
				q: "Can I use Wi-Fi and cellular at the same time?",
				a: "The native app can duplicate packets across both links, which covers you when one of them drops out. It does not aggregate their bandwidth — two half-speed connections do not add up to one fast one.",
			},
			{
				q: "What happens if I switch phones mid-stream?",
				a: "When a second phone or browser goes live, it takes over Direct output. To hand off cameras, just start the feed on the new device.",
			},
			{
				q: "Do I have to use OBS?",
				a: "No. Direct can send a phone or browser feed straight to Twitch, Kick, or YouTube. Use your own OBS when you want scenes, overlays, alerts, plugins, or local recording.",
			},
		],
	},
	closing: {
		eyebrow: "Your OBS or Direct",
		title: "Keep the studio. Drop the bill.",
		body: "VISP is free during beta. Get the phone apps, browser publisher, and OBS plugin — ",
		link: "see Download & beta",
	},
	footer: [
		{ label: "Founding creators", href: "/affiliate", external: false },
		{ label: "Blog", href: "/blog", external: false },
		{ label: "Docs", href: legalEntity.docsUrl, external: true },
		{ label: "Download", href: "/download", external: false },
		{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
		{ label: "X", href: legalEntity.xUrl, external: true },
		{ label: "Privacy", href: "/privacy", external: false },
		{ label: "Contact", href: "/contact", external: false },
		{ label: "Terms", href: "/terms", external: false },
		{ label: "Cookies", href: "/cookies", external: false },
	] as LandingLink[],
	seppo: {
		placeholder: "Ask about VISP…",
		subtitle: "Product guide — ask what VISP can do",
		suggestions: [
			"Can I stream without OBS?",
			"Which workflow fits me?",
			"How does VISP handle connection drops?",
		],
		welcome:
			"Hi, I'm Seppo. Ask how to bring a field feed into your own OBS or stream directly to your platform.",
	},
};

const fi: typeof en = {
	meta: {
		title: "VISP — Lopeta pilvi-OBS:n vuokraaminen. Puhelin omaan OBS:ään",
		description:
			"Tuo puhelimen kuva jo omistamaasi OBS:ään ja lopeta 120–180 dollarin kuukausimaksu pilvi-OBS:stä. Ei tietokonetta? Lähetä Directillä suoraan Twitchiin, Kickiin tai YouTubeen. Ilmainen betan ajan.",
	},
	nav: [
		{
			label: "Lataa",
			href: "/download",
			external: false,
			search: { lang: "fi" },
		},
		{ label: "Ohjeet", href: `${legalEntity.docsUrl}/fi`, external: true },
	],
	langSwitch: { label: "EN", href: "/", hrefLang: "en" },
	tryCta: "Kokeile VISPiä ilmaiseksi",
	downloadLink: "Lataa sovellus",
	hero: {
		eyebrow: "Ilmainen betan ajan",
		title: "Lopeta pilvi-OBS:n vuokraaminen.",
		body: "Lähetä puhelimesta kotona jo pyörivään OBS:ään. Kohtaukset, grafiikat, hälytykset ja lisäosat toimivat edelleen — ilman 120–180 dollarin kuukausilaskua.",
		note: "Ei avattavia portteja · ei lähetysavainta puhelimeen",
		videoLabel: "VISP-lähetys käynnistyy ja kuva saapuu OBS:iin",
		videoCaption: "AITO LÄHETYS · 8 S",
	},
	path: {
		label: "Signaalitie",
		studio: {
			tag: "Oma OBS",
			nodes: ["Puhelin", "VISP-relay", "Oma OBS", "Twitch · Kick · YouTube"],
		},
		direct: {
			tag: "Direct",
			nodes: ["Puhelin", "VISP-relay", "Ei konetta", "Twitch · Kick · YouTube"],
		},
	},
	cost: {
		eyebrow: "Laskelma",
		title: "Säästä 1 440–2 160 $ vuodessa",
		body: "Vertailun rajattomat pilvi-OBS-tilaukset maksavat 120–180 dollaria kuukaudessa. Jos sinulla on jo OBS:ää pyörittävä tietokone, VISP tuo syötteen siihen betan ajan ilmaiseksi. Jos tarvitset hallitun pilvistudion tai aitoa mobiiliyhteyksien niputusta, maksullinen palvelu voi silti olla oikea valinta.",
		chartTitle: "12 kuukauden ohjelmistokulut",
		chartSubtitle: "Kun omistat jo OBS:ää pyörittävän tietokoneen.",
		chartNote: "Ei sisällä laitteistoa, sähköä tai internetyhteyttä.",
		rows: [
			{ product: "VISP + oma OBS", cost: "0 $ betan ajan", width: "4%" },
			{ product: "IRLToolkit", cost: "1 548–2 148 $", width: "99.4%" },
			{ product: "Streamable.run", cost: "1 440–2 160 $", width: "100%" },
		],
		tableToggle: "Näytä koko vertailu",
		tableCaption:
			"VISPin, IRLToolkitin, Streamable.runin, IRLServerin ja BELABOXin vertailu",
		checked: "Julkiset listahinnat, tarkistettu",
	},
	workflows: {
		eyebrow: "Kaksi tapaa lähettää",
		title: "Oma studio tai ei studiota lainkaan",
		studio: {
			tag: "VISP + oma OBS",
			title: "Tuo puhelin studioosi",
			steps: [
				{
					title: "Asenna lisäosa",
					body: "Asenna VISP OBS -lisäosa ja kirjaudu sisään.",
				},
				{
					title: "Lisää syöte",
					body: "Lisää valtuutettu puhelinsyöte OBS:ään lähteeksi.",
				},
				{
					title: "Aja lähetys",
					body: "Käytä nykyisiä kohtauksia, grafiikoita, hälytyksiä ja paikallista tallennusta. Vaihda kohtauksia puhelimesta.",
				},
			],
			image: "/marketing/app-obs-control.jpg",
			imageAlt: "OBS-kohtauksen vaihto VISP-sovelluksesta",
		},
		direct: {
			tag: "Direct",
			title: "Tai jätä tietokone pois",
			steps: [
				{
					title: "Kirjaudu sisään",
					body: "Kirjaudu Twitchillä, Kickillä tai Googlella.",
				},
				{
					title: "Yhdistä alustasi",
					body: "Valitse Twitch-, Kick- tai YouTube-kanava, jolla lähetät.",
				},
				{
					title: "Aloita lähetys",
					body: "Avaa VISP-sovellus ja aloita. Puhelimeen ei tarvita OBS:ää tai lähetysavainta.",
				},
			],
			image: "/marketing/app-live.jpg",
			imageAlt: "VISP-sovelluksen suora lähetys",
		},
	},
	channels: {
		title: "Vähemmän epävarmuutta lähetyksessä",
		items: [
			{
				tag: "VERKKO",
				title: "Lähetys jatkuu yhden yhteyden katketessa",
				body: "Natiivisovellus voi monistaa paketit Wi-Fi- ja mobiiliyhteyteen, joten yhden yhteyden katkeamisen ei tarvitse lopettaa lähetystä.",
			},
			{
				tag: "AVAIN",
				title: "Pidä lähetysavain poissa puhelimesta",
				body: "Direct hakee valtuutetun kohteen tunnukset palvelimella. Kadonnut tai lainattu julkaisulaite ei koskaan saa lähetysavaintasi.",
			},
			{
				tag: "HALLINTA",
				title: "Ohjaa OBS:ää avaamatta portteja",
				body: "Vaihda kohtauksia ja ohjaa lähetystä sovelluksesta avaamatta kotikoneeseesi ulkoa saavutettavaa hallintaporttia.",
			},
			{
				tag: "TARKISTUS",
				title: "Virhe näkyy ennen kuin yleisö saapuu",
				body: "VISP tarkistaa valtuutuksen, omistajuuden ja relayn kapasiteetin ennen kuvadatan vastaanottamista, kun asetukset ehtii vielä korjata.",
			},
		],
	},
	faq: {
		eyebrow: "Usein kysyttyä",
		title: "Kysymyksiä ennen betaa",
		items: [
			{
				q: "Voiko VISP korvata pilvi-OBS-tilaukseni?",
				a: "Kyllä, jos omistat jo tietokoneen, joka pyörittää OBS:ää. VISP tuo puhelimen tai selaimen etäsyötteen omaan OBS:ääsi, jossa nykyiset kohtaukset, grafiikat, hälytykset ja lisäosat toimivat edelleen.",
			},
			{
				q: "Kuinka paljon voin säästää?",
				a: "Vertailun rajattomat pilvi-OBS-tilaukset maksavat 120–180 dollaria kuukaudessa eli 1 440–2 160 dollaria vuodessa. VISP on betan ajan ilmainen. Laitteisto, sähkö ja internetyhteys eivät sisälly laskelmaan.",
			},
			{
				q: "Pitääkö lähetysavain liittää puhelimeen?",
				a: "Ei. VISP hakee valtuutetun kohteen tunnukset vain Direct-lähdön käynnistämiseksi eikä palauta niitä julkaisevalle laitteelle. Kadonnut tai lainattu puhelin ei siis vuoda avaintasi.",
			},
			{
				q: "Voinko käyttää Wi-Fiä ja mobiiliverkkoa yhtä aikaa?",
				a: "Natiivisovellus voi monistaa paketit molempiin yhteyksiin, mikä auttaa kun toinen katkeaa. Se ei kuitenkaan yhdistä niiden kaistaa — kaksi puolinopeaa yhteyttä eivät summaudu yhdeksi nopeaksi.",
			},
			{
				q: "Mitä tapahtuu jos vaihdan puhelinta kesken lähetyksen?",
				a: "Uusin offline-laite saa Direct-omistajuuden aloittaessaan, joten toiseen kameraan vaihtaminen onnistuu käynnistämällä syöte siinä.",
			},
			{
				q: "Onko minun pakko käyttää OBS:ää?",
				a: "Ei. Direct voi lähettää puhelimen tai selaimen syötteen suoraan Twitchiin, Kickiin tai YouTubeen. Käytä omaa OBS:ää, kun haluat kohtaukset, grafiikat, hälytykset, lisäosat tai paikallisen tallennuksen.",
			},
		],
	},
	closing: {
		eyebrow: "Oma OBS tai Direct",
		title: "Pidä studio. Luovu laskusta.",
		body: "VISP on betan ajan ilmainen. Hanki puhelinsovellus, selainjulkaisija ja OBS-lisäosa: ",
		link: "katso Lataus ja beta",
	},
	footer: [
		{ label: "Kumppanit", href: "/fi/affiliate", external: false },
		{ label: "Blogi", href: "/blog", external: false },
		{
			label: "Lataa",
			href: "/download",
			external: false,
			search: { lang: "fi" },
		},
		{ label: "Ohjeet", href: `${legalEntity.docsUrl}/fi`, external: true },
		{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
		{ label: "Yhteystiedot", href: "/contact", external: false },
		{ label: "X", href: legalEntity.xUrl, external: true },
		{ label: "Tietosuoja", href: "/privacy", external: false },
		{ label: "Käyttöehdot", href: "/terms", external: false },
		{ label: "Evästeet", href: "/cookies", external: false },
	],
	seppo: {
		placeholder: "Kysy VISPistä…",
		subtitle: "Tuoteopas — kysy, mitä VISP osaa",
		suggestions: [
			"Voinko striimata ilman OBS:ää?",
			"Kumpi työnkulku sopii minulle?",
			"Miten VISP käsittelee yhteyskatkot?",
		],
		welcome:
			"Hei, olen Seppo. Kysy, miten tuot kenttäsyötteen omaan OBS:ääsi tai striimaat Directillä suoraan alustalle.",
	},
};

export const landingCopy = { en, fi };
