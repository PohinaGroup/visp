import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { MeterMark } from "@/components/meter-mark";
import { SeppoWidget } from "@/components/seppo-widget";
import { authClient } from "@/lib/auth-client";
import {
	COMPARISON_CHECKED,
	comparisonProducts,
	comparisonRows,
	comparisonRowsFi,
} from "@/lib/comparison";
import { type Locale, landingHead, localeSearch } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";
export const Route = createFileRoute("/")({
	head: () =>
		landingHead(
			"en",
			"VISP — Reliable IRL Streaming from Your Phone",
			"Stream from your phone directly to Twitch, Kick, or YouTube, or route it securely into your home OBS. VISP is free during beta.",
			faq,
		),
	component: () => <HomeComponent locale="en" />,
});

function TryCta({
	locale,
	size = "sm",
}: {
	locale: Locale;
	size?: "sm" | "lg";
}) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const lg = size === "lg";
	return (
		<button
			type="button"
			onClick={() =>
				session
					? navigate({ to: "/dashboard", search: localeSearch(locale) })
					: navigate({ to: "/login", search: localeSearch(locale) })
			}
			className={`inline-flex items-center justify-center rounded-[var(--radius)] bg-primary font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
				lg ? "h-12 px-8 text-base" : "h-9 px-4 text-sm"
			}`}
		>
			{locale === "fi" ? "Kokeile VISPiä ilmaiseksi" : "Try VISP free"}
		</button>
	);
}

// Features as channel strips: the mono tag is the signal-path capability,
// not decoration. No 01/02/03 — these are channels, not a sequence.
const channels = [
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
];

const steps = [
	{
		tag: "STEP 01",
		title: "Connect your home OBS",
		body: "Install the VISP OBS plugin and sign in. It adds your authenticated remote feeds without port forwarding or hand-pasting Media Source URLs.",
	},
	{
		tag: "STEP 02",
		title: "Publish from phone or browser",
		body: "Open the VISP app on iOS or Android, or use the browser publisher on a laptop. VISP carries that contribution feed back to your studio.",
	},
	{
		tag: "STEP 03",
		title: "Produce on hardware you own",
		body: "Switch scenes, run overlays and alerts, record locally, and send the finished show from your own OBS to Twitch, Kick, YouTube, or any custom destination.",
	},
];

const stepsFi = [
	{
		tag: "VAIHE 01",
		title: "Yhdistä kodin OBS",
		body: "Asenna VISP OBS -lisäosa ja kirjaudu sisään. Se lisää valtuutetut etäsyötteet ilman porttiohjausta tai Media Source -osoitteiden käsin liittämistä.",
	},
	{
		tag: "VAIHE 02",
		title: "Julkaise puhelimesta tai selaimesta",
		body: "Avaa VISP-sovellus iOS- tai Android-laitteella tai käytä selainjulkaisijaa läppärillä. VISP kuljettaa syötteen takaisin studioosi.",
	},
	{
		tag: "VAIHE 03",
		title: "Tuota omalla laitteistollasi",
		body: "Vaihda kohtauksia, aja grafiikat ja hälytykset, tallenna paikallisesti ja lähetä valmis ohjelma omasta OBS:stä Twitchiin, Kickiin, YouTubeen tai muuhun kohteeseen.",
	},
];

export const faq = [
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
];

export const faqFi = [
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
];

type LandingLink = {
	label: string;
	href: string;
	external: boolean;
	search?: { lang: "fi" };
};

const footerLinks: LandingLink[] = [
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
];

const navLinks: LandingLink[] = [
	{ label: "Founding creators", href: "/affiliate", external: false },
	{ label: "Blog", href: "/blog", external: false },
	{ label: "Docs", href: legalEntity.docsUrl, external: true },
	{ label: "Download", href: "/download", external: false },
	{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
	{ label: "Contact", href: "/contact", external: false },
];

const LANDING_SEPPO_SUGGESTIONS = [
	"Can I stream without OBS?",
	"Which workflow fits me?",
	"How does VISP handle connection drops?",
];

const heroProofBullets = [
	{
		label: "Direct",
		body: "Authorize once, go live from phone or browser. Stream keys stay out of the publisher.",
	},
	{
		label: "OBS optional",
		body: "Same contribution feed for monitoring, recording, scenes, and alerts.",
	},
	{
		label: "Remote control",
		body: "Start, stop, and switch scenes from your phone.",
	},
] as const;

const heroProofBulletsFi = [
	{
		label: "Direct",
		body: "Valtuuta kerran ja lähetä puhelimesta tai selaimesta. Lähetysavaimet eivät päädy julkaisulaitteelle.",
	},
	{
		label: "OBS valinnainen",
		body: "Sama syöte valvontaan, tallennukseen, kohtauksiin ja hälytyksiin.",
	},
	{
		label: "Etäohjaus",
		body: "Käynnistä, lopeta ja vaihda kohtauksia puhelimesta.",
	},
] as const;

const eyebrow =
	"font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground";

const annualCosts = [
	{ product: "VISP + your OBS", cost: "$0 during beta", width: "0%" },
	{ product: "IRLToolkit", cost: "$1,548–$2,148", width: "99.4%" },
	{ product: "Streamable.run", cost: "$1,440–$2,160", width: "100%" },
] as const;

const annualCostsFi = [
	{ product: "VISP + oma OBS", cost: "0 $ betan ajan", width: "0%" },
	{ product: "IRLToolkit", cost: "1 548–2 148 $", width: "99.4%" },
	{ product: "Streamable.run", cost: "1 440–2 160 $", width: "100%" },
] as const;

function AnnualCostChart({ locale }: { locale: Locale }) {
	const fi = locale === "fi";
	return (
		<figure className="mt-12 border border-border bg-card p-6 sm:p-8">
			<figcaption className="font-display font-semibold text-2xl uppercase tracking-tight">
				{fi ? "12 kuukauden ohjelmistokulut" : "12-month software cost"}
			</figcaption>
			<p className="mt-2 text-muted-foreground text-sm">
				{fi
					? "Kun omistat jo OBS:ää pyörittävän tietokoneen."
					: "When you already own a computer that can run OBS."}
			</p>
			<ul className="mt-8 flex flex-col gap-6">
				{(fi ? annualCostsFi : annualCosts).map((row) => (
					<li key={row.product}>
						<div className="mb-2 flex items-baseline justify-between gap-4">
							<span className="font-medium">{row.product}</span>
							<span className="font-mono text-sm">{row.cost}</span>
						</div>
						<div className="h-3 bg-muted" aria-hidden="true">
							<div
								className="h-full min-w-px bg-primary"
								style={{ width: row.width }}
							/>
						</div>
					</li>
				))}
			</ul>
			<p className="mt-6 font-mono text-muted-foreground text-xs">
				{fi
					? "Ei sisällä laitteistoa, sähköä tai internetyhteyttä."
					: "Excludes hardware, electricity, and internet service."}
			</p>
		</figure>
	);
}

function ComparisonTable({ locale }: { locale: Locale }) {
	const fi = locale === "fi";
	const rows = fi ? comparisonRowsFi : comparisonRows;
	return (
		// A real <table>: crawlers and answer engines parse it, a grid of divs
		// they do not.
		<div className="mt-12 overflow-x-auto">
			<table className="w-full min-w-[860px] border-collapse border border-border text-left text-sm">
				<caption className="sr-only">
					{fi
						? "VISPin, IRLToolkitin, Streamable.runin, IRLServerin ja BELABOXin vertailu"
						: "VISP compared with IRLToolkit, Streamable.run, IRLServer, and BELABOX"}
				</caption>
				<thead>
					<tr>
						<th scope="col" className="border-border border-b p-4" />
						{comparisonProducts.map((product, i) => (
							<th
								key={product}
								scope="col"
								className={`border-border border-b p-4 font-display font-semibold text-base uppercase tracking-tight ${
									i === 0 ? "bg-card" : "text-muted-foreground"
								}`}
							>
								{product}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.label}>
							<th
								scope="row"
								className="border-border border-b p-4 font-mono font-normal text-muted-foreground text-xs uppercase tracking-[0.2em]"
							>
								{row.label}
							</th>
							{row.cells.map((cell, i) => (
								<td
									key={comparisonProducts[i]}
									className={`border-border border-b p-4 align-top leading-relaxed ${
										i === 0 ? "bg-card font-medium" : "text-muted-foreground"
									}`}
								>
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function HomeComponent({ locale }: { locale: Locale }) {
	const [seppoOpen, setSeppoOpen] = useState(false);
	const fi = locale === "fi";
	const localizedChannels = fi
		? [
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
			]
		: channels;
	const localizedNavLinks: LandingLink[] = fi
		? [
				{ label: "Kumppanit", href: "/fi/affiliate", external: false },
				{ label: "Blogi", href: "/blog", external: false },
				{ label: "Ohjeet", href: `${legalEntity.docsUrl}/fi`, external: true },
				{
					label: "Lataa",
					href: "/download",
					external: false,
					search: { lang: "fi" },
				},
				{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
				{ label: "Yhteystiedot", href: "/contact", external: false },
			]
		: navLinks;
	const localizedFooterLinks: LandingLink[] = fi
		? [
				...localizedNavLinks,
				{ label: "X", href: legalEntity.xUrl, external: true },
				{ label: "Tietosuoja", href: "/privacy", external: false },
				{ label: "Käyttöehdot", href: "/terms", external: false },
				{ label: "Evästeet", href: "/cookies", external: false },
			]
		: footerLinks;

	return (
		<>
			<main className="min-h-screen bg-background text-foreground">
				<div className="mx-auto max-w-[1100px] px-6">
					{/* Top nav */}
					<header className="flex items-center justify-between border-border border-b py-5">
						<Link to={fi ? "/fi" : "/"} className="flex items-center gap-3">
							<span className="font-bold font-display text-xl uppercase leading-none tracking-[0.28em]">
								VISP
							</span>
							<MeterMark />
						</Link>
						<nav className="flex items-center gap-7 text-sm">
							<span className="hidden items-center gap-7 sm:flex">
								{localizedNavLinks.map((l) =>
									l.external ? (
										<a
											key={l.label}
											href={l.href}
											target="_blank"
											rel="noreferrer"
											className="text-muted-foreground transition-colors hover:text-foreground"
										>
											{l.label}
										</a>
									) : (
										<Link
											key={l.label}
											to={l.href}
											search={l.search}
											className="text-muted-foreground transition-colors hover:text-foreground"
										>
											{l.label}
										</Link>
									),
								)}
							</span>
							<a
								href={fi ? "/" : "/fi"}
								hrefLang={fi ? "en" : "fi"}
								className="text-muted-foreground hover:text-foreground"
							>
								{fi ? "EN" : "FI"}
							</a>
							<TryCta locale={locale} />
						</nav>
					</header>

					{/* Hero */}
					<section className="lander-rise grid gap-10 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
						<div className="flex flex-col gap-7">
							<h1 className="font-display font-semibold text-5xl uppercase leading-[0.92] tracking-tight sm:text-6xl md:text-[4.75rem]">
								{fi ? "Puhelimesi on kamera." : "Your phone is the camera."}
							</h1>
							<p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
								{fi
									? "Lähetä suoraan Twitchiin, Kickiin tai YouTubeen — OBS vain jos tarvitset grafiikat."
									: "Stream straight to Twitch, Kick, or YouTube — OBS only if you want scenes and graphics."}
							</p>
							<div className="flex flex-wrap items-center gap-4">
								<TryCta locale={locale} size="lg" />
								<a
									href={fi ? `${legalEntity.docsUrl}/fi` : legalEntity.docsUrl}
									target="_blank"
									rel="noreferrer"
									className="text-sm underline underline-offset-4"
								>
									{fi ? "Lue ohjeet" : "Read the docs"}
								</a>
							</div>
							<ul className="flex flex-col gap-3 text-muted-foreground text-sm leading-relaxed">
								{(fi ? heroProofBulletsFi : heroProofBullets).map((item) => (
									<li key={item.label}>
										<span className="font-medium text-foreground">
											{item.label}
										</span>
										{" — "}
										{item.body}
									</li>
								))}
							</ul>
						</div>

						<div className="flex justify-center md:justify-end">
							<figure className="relative w-full max-w-[300px] overflow-hidden rounded-[14px] border border-border bg-card">
								<video
									autoPlay
									muted
									loop
									playsInline
									preload="metadata"
									poster="/marketing/go-live-loop.jpg"
									aria-label={
										fi
											? "VISP-lähetys käynnistyy ja kuva saapuu OBS:iin"
											: "A VISP stream goes live and arrives in OBS"
									}
									className="aspect-[9/16] w-full object-cover"
								>
									<source
										src="/marketing/go-live-loop.m4v"
										type="video/mp4"
									/>
								</video>
								<figcaption className="absolute top-3 left-3 rounded-sm bg-background/85 px-2 py-1 font-mono text-[10px] text-foreground uppercase tracking-wider backdrop-blur-sm">
									{fi ? "AITO LÄHETYS · 8 S" : "REAL GO-LIVE · 8 SEC"}
								</figcaption>
							</figure>
						</div>
					</section>

					{/* Two paths: let visitors self-select before technical detail. */}
					<section id="workflows" className="border-border border-y py-20">
						<span className={eyebrow}>
							{fi ? "Valitse työnkulkusi" : "Choose your workflow"}
						</span>
						<h2 className="mt-5 max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl">
							{fi ? "Tietokone on valinnainen" : "The computer is optional"}
						</h2>
						<div className="mt-12 grid gap-px border border-border bg-border md:grid-cols-2">
							<article className="bg-background p-8">
								<span className={eyebrow}>VISP Direct</span>
								<h3 className="mt-4 font-display font-semibold text-3xl uppercase leading-tight tracking-tight">
									{fi ? "Puhelimesta suoraan alustalle" : "Phone to platform"}
								</h3>
								<p className="mt-4 text-muted-foreground leading-relaxed">
									{fi
										? "Et tarvitse tietokonetta. Kirjaudu sisään, valitse Twitch, Kick tai YouTube ja aloita lähetys puhelimesta tai selaimesta. VISP hoitaa kohdelähdön relaylla."
										: "No computer required. Sign in, choose Twitch, Kick, or YouTube, and go live from your phone or browser. VISP handles the destination output at the relay."}
								</p>
								<p className="mt-5 font-mono text-muted-foreground text-xs uppercase tracking-[0.16em]">
									{fi
										? "Kävelystriimit · matkat · nopeat lähetykset"
										: "Walk-and-talk · travel · spontaneous streams"}
								</p>
							</article>
							<article className="bg-background p-8">
								<span className={eyebrow}>VISP + OBS</span>
								<h3 className="mt-4 font-display font-semibold text-3xl uppercase leading-tight tracking-tight">
									{fi ? "Puhelimesta omaan OBS:ään" : "Phone to your OBS"}
								</h3>
								<p className="mt-4 text-muted-foreground leading-relaxed">
									{fi
										? "Tuo kenttäsyöte turvallisesti kotikoneesi OBS:ään. Pidä nykyiset kohtaukset, grafiikat, ääniasetukset ja paikallinen tallennus ilman vuokrattua pilvistudiota."
										: "Bring the field feed securely into OBS at home. Keep your existing scenes, overlays, audio routing, and local recording without renting a cloud studio."}
								</p>
								<p className="mt-5 font-mono text-muted-foreground text-xs uppercase tracking-[0.16em]">
									{fi
										? "Kohtaukset · monikamera · etätuotanto"
										: "Scenes · multi-camera · remote production"}
								</p>
							</article>
						</div>
					</section>

					{/* Channels */}
					<section className="py-20">
						<h2 className="max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl">
							{fi
								? "Vähemmän epävarmuutta lähetyksessä"
								: "Less uncertainty on air"}
						</h2>
						<h3 className="mt-14 mb-4 font-display font-semibold text-2xl uppercase leading-none tracking-tight">
							{fi ? "Mitä VISP ratkaisee" : "What VISP solves"}
						</h3>
						<ul className="grid gap-px border border-border bg-border sm:grid-cols-2">
							{localizedChannels.map((c) => (
								<li key={c.tag} className="bg-background p-8">
									<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
										{c.tag}
									</span>
									<h3 className="mt-4 font-display font-semibold text-2xl uppercase leading-tight tracking-tight">
										{c.title}
									</h3>
									<p className="mt-3 text-muted-foreground leading-relaxed">
										{c.body}
									</p>
								</li>
							))}
						</ul>
					</section>

					{/* How it works */}
					<section className="border-border border-t py-20">
						<span className={eyebrow}>
							{fi ? "Näin se toimii" : "How it works"}
						</span>
						<h2 className="mt-5 max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl">
							{fi
								? "Lisää oma OBS, kun tarvitset studion"
								: "Add your OBS when you need a studio"}
						</h2>
						<p className="mt-6 max-w-2xl text-muted-foreground leading-relaxed">
							{fi
								? "Direct toimii ilman tietokonetta. Kun tuotanto tarvitsee kohtauksia, grafiikoita, lisäosia tai paikallisen tallennuksen, VISP kuljettaa kenttäsyötteen jo omistamaasi studioon."
								: "Direct works without a computer. When the production needs scenes, overlays, plugins, or local recording, VISP carries the field feed into the studio you already own."}
						</p>
						<ol className="mt-12 grid gap-px border border-border bg-border md:grid-cols-3">
							{(fi ? stepsFi : steps).map((s) => (
								<li key={s.tag} className="bg-background p-8">
									<span className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
										{s.tag}
									</span>
									<h3 className="mt-4 font-display font-semibold text-2xl uppercase leading-tight tracking-tight">
										{s.title}
									</h3>
									<p className="mt-3 text-muted-foreground leading-relaxed">
										{s.body}
									</p>
								</li>
							))}
						</ol>
					</section>

					{/* Comparison */}
					<section id="compare" className="border-border border-t py-20">
						<span className={eyebrow}>{fi ? "Vertailu" : "Comparison"}</span>
						<h2 className="mt-5 max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl">
							{fi
								? "Lopeta jo omistamasi OBS:n vuokraaminen"
								: "Stop renting the OBS you already own"}
						</h2>
						<p className="mt-6 max-w-2xl text-muted-foreground leading-relaxed">
							{fi
								? "Vertailun rajattomat pilvi-OBS-tilaukset maksavat 120–180 dollaria kuukaudessa. Jos sinulla on jo OBS:ää pyörittävä tietokone, VISP tuo syötteen siihen betan ajan ilmaiseksi — 12 kuukauden ohjelmistosäästö on 1 440–2 160 dollaria. Jos tarvitset hallitun pilvistudion tai aitoa mobiiliyhteyksien niputusta, maksullinen palvelu voi silti olla oikea valinta."
								: "Unlimited cloud OBS plans in this comparison cost $120–180 a month. If you already have a computer that runs OBS, VISP brings the feed to it free during beta — a 12-month software saving of $1,440–$2,160. If you need a managed cloud studio or true cellular bonding, a paid service can still be the right choice."}
						</p>
						<AnnualCostChart locale={locale} />
						<ComparisonTable locale={locale} />
						<p className="mt-6 font-mono text-muted-foreground text-xs">
							{fi
								? `Julkiset listahinnat, tarkistettu ${COMPARISON_CHECKED}.`
								: `Public list prices, checked ${COMPARISON_CHECKED}.`}
						</p>
					</section>

					{/* FAQ */}
					<section className="border-border border-t py-20">
						<span className={eyebrow}>
							{fi ? "Usein kysyttyä" : "Frequently asked"}
						</span>
						<h2 className="mt-5 max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl">
							{fi ? "Kysymyksiä ennen betaa" : "Questions before the beta"}
						</h2>
						<dl className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
							{(fi ? faqFi : faq).map((item) => (
								<div key={item.q}>
									<dt className="font-display font-semibold text-xl leading-snug tracking-tight">
										{item.q}
									</dt>
									<dd className="mt-3 text-muted-foreground leading-relaxed">
										{item.a}
									</dd>
								</div>
							))}
						</dl>
					</section>

					{/* Closing CTA */}
					<section className="border-border border-t py-24 text-center">
						<span className={eyebrow}>
							{fi
								? "Suoraan tai studion kautta"
								: "Direct or through your studio"}
						</span>
						<h2 className="mt-5 font-display font-semibold text-6xl uppercase leading-none tracking-tight sm:text-7xl">
							{fi ? "Aloita IRL-striimaus" : "Start streaming IRL"}
						</h2>
						<div className="mt-8 flex flex-col items-center gap-3">
							<TryCta locale={locale} size="lg" />
							<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
								{fi
									? "VISP on betan ajan ilmainen. Hanki puhelinsovellus, selainjulkaisija ja OBS-lisäosa: "
									: "VISP is free during beta. Get the phone apps, browser publisher, and OBS plugin — "}
								<Link
									to="/download"
									search={fi ? { lang: "fi" } : {}}
									className="text-foreground underline underline-offset-4"
								>
									{fi ? "katso Lataus ja beta" : "see Download & beta"}
								</Link>
								.
							</p>
						</div>
					</section>

					{/* Footer */}
					<footer className="flex flex-col gap-4 border-border border-t py-10">
						<nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
							{localizedFooterLinks.map((l) =>
								l.external ? (
									<a
										key={l.label}
										href={l.href}
										target="_blank"
										rel="noreferrer"
										className="text-muted-foreground transition-colors hover:text-foreground"
									>
										{l.label}
									</a>
								) : (
									<Link
										key={l.label}
										to={l.href}
										search={l.search}
										className="text-muted-foreground transition-colors hover:text-foreground"
									>
										{l.label}
									</Link>
								),
							)}
						</nav>
						<p className="font-mono text-muted-foreground text-xs">
							{fi
								? "© 2026 VISP · Pöhinä Group Oy"
								: "© 2026 VISP · Pöhinä Group Oy"}
						</p>
					</footer>
				</div>
			</main>
			<SeppoWidget
				context="landing"
				open={seppoOpen}
				placeholder={fi ? "Kysy VISPistä…" : "Ask about VISP…"}
				subtitle={
					fi
						? "Tuoteopas — kysy, mitä VISP osaa"
						: "Product guide — ask what VISP can do"
				}
				suggestions={
					fi
						? [
								"Voinko striimata ilman OBS:ää?",
								"Kumpi työnkulku sopii minulle?",
								"Miten VISP käsittelee yhteyskatkot?",
							]
						: LANDING_SEPPO_SUGGESTIONS
				}
				welcome={
					fi
						? "Hei, olen Seppo. Kysy, miten striimaat Directillä suoraan alustalle tai tuot kenttäsyötteen omaan OBS:ääsi."
						: "Hi, I'm Seppo. Ask how to stream directly to your platform or bring a field feed into your own OBS."
				}
				onOpenChange={setSeppoOpen}
			/>
		</>
	);
}
