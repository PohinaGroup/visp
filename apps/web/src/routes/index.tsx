import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
import { scheduleLandingSeppoAutoOpen } from "@/lib/seppo-landing";

export const Route = createFileRoute("/")({
	head: () =>
		landingHead(
			"en",
			"VISP — Replace Cloud OBS with Your Own Streaming PC",
			"Send phone and browser feeds to OBS on hardware you own. Keep your scenes, overlays, and control without a $120–180 monthly cloud OBS subscription. VISP is free during beta.",
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

// The signature: source → relay → home OBS → platform as one precise patch diagram.
const CHAIN = [
	{ x: 120, tag: "SOURCE", label: "phone/browser" },
	{ x: 380, tag: "RELAY", label: "visp" },
	{ x: 640, tag: "STUDIO", label: "home OBS" },
	{ x: 900, tag: "OUT", label: "your platform" },
] as const;

function SignalChain({ locale }: { locale: Locale }) {
	const labels =
		locale === "fi"
			? ["puhelin/selain", "visp", "kodin OBS", "oma alusta"]
			: CHAIN.map((item) => item.label);
	return (
		<svg
			role="img"
			aria-label={
				locale === "fi"
					? "Signaaliketju puhelimesta tai selaimesta VISP-relayn kautta kodin OBS-studioon ja suoratoistopalveluun."
					: "Signal chain: phone or browser through the VISP relay to OBS on your home hardware, then to your streaming platform."
			}
			viewBox="0 0 1000 80"
			className="block w-full text-foreground"
		>
			<line
				x1="24"
				y1="40"
				x2="976"
				y2="40"
				stroke="currentColor"
				strokeOpacity="0.28"
				strokeWidth="1"
			/>
			{CHAIN.map((n, index) => (
				<g key={n.tag}>
					<rect
						x={n.x - 6}
						y={34}
						width={12}
						height={12}
						fill="var(--background)"
						stroke="currentColor"
						strokeWidth="1.25"
					/>
					<text
						x={n.x}
						y={22}
						textAnchor="middle"
						className="font-mono"
						fontSize="12"
						letterSpacing="1.5"
						fill="currentColor"
					>
						{n.tag}
					</text>
					<text
						x={n.x}
						y={64}
						textAnchor="middle"
						className="font-mono"
						fontSize="11"
						fill="currentColor"
						fillOpacity="0.5"
					>
						{labels[index]}
					</text>
				</g>
			))}
			<circle className="chain-packet" r="4" fill="var(--color-tally)" />
		</svg>
	);
}

const productShots = [
	{
		src: "/marketing/app-live.jpg",
		alt: "Live control with OBS status",
		tag: "LIVE",
	},
	{
		src: "/marketing/app-obs-control.jpg",
		alt: "Ready to go live with chat overlay",
		tag: "READY",
	},
	{
		src: "/marketing/app-settings.jpg",
		alt: "Camera settings — resolution, frame rate, relay",
		tag: "CONFIG",
	},
] as const;

// Features as channel strips: the mono tag is the signal-path capability,
// not decoration. No 01/02/03 — these are channels, not a sequence.
const channels = [
	{
		tag: "OWN",
		title: "Use the hardware you own",
		body: "Run OBS on your existing PC or Mac instead of renting a cloud machine every month.",
	},
	{
		tag: "OBS",
		title: "Keep your whole OBS workflow",
		body: "Your scenes, overlays, alerts, plugins, and local recordings stay where you already built them.",
	},
	{
		tag: "FIELD",
		title: "Bring the field feed home",
		body: "Publish from the VISP mobile app or browser and pull the authenticated contribution feed into OBS.",
	},
	{
		tag: "BILL",
		title: "Drop the cloud studio bill",
		body: "VISP is free during beta, replacing $1,440–$2,160 a year in cloud OBS subscription fees.",
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
		a: "The newest offline device takes Direct ownership when it goes live, so handing off to a second camera is a matter of starting the feed on it.",
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
	{ label: "Affiliates", href: "/affiliate", external: false },
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
	{ label: "Affiliates", href: "/affiliate", external: false },
	{ label: "Blog", href: "/blog", external: false },
	{ label: "Docs", href: legalEntity.docsUrl, external: true },
	{ label: "Download", href: "/download", external: false },
	{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
	{ label: "Contact", href: "/contact", external: false },
];

const LANDING_SEPPO_SUGGESTIONS = [
	"Can VISP replace cloud OBS?",
	"How much would I save?",
	"How do I connect my home OBS?",
];

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
					tag: "OMA",
					title: "Käytä omistamaasi laitteistoa",
					body: "Aja OBS:ää nykyisellä PC:lläsi tai Macillasi sen sijaan, että vuokraisit pilvikoneen joka kuukausi.",
				},
				{
					tag: "OBS",
					title: "Pidä koko OBS-työnkulkusi",
					body: "Kohtaukset, grafiikat, hälytykset, lisäosat ja paikalliset tallenteet säilyvät siellä, minne ne jo rakensit.",
				},
				{
					tag: "FIELD",
					title: "Tuo kenttäsyöte kotiin",
					body: "Julkaise VISP-mobiilisovelluksella tai selaimella ja vedä valtuutettu syöte OBS:ään.",
				},
				{
					tag: "LASKU",
					title: "Pudota pilvistudion lasku",
					body: "VISP on betan ajan ilmainen ja korvaa 1 440–2 160 dollarin vuotuiset pilvi-OBS-maksut.",
				},
			]
		: channels;
	const localizedShots = fi
		? [
				{ ...productShots[0], alt: "Suoran lähetyksen ohjaus ja OBS-tila" },
				{
					...productShots[1],
					alt: "Valmis aloittamaan lähetys chat-näkymällä",
				},
				{
					...productShots[2],
					alt: "Kameran tarkkuus-, kuvataajuus- ja relay-asetukset",
				},
			]
		: productShots;
	const localizedNavLinks: LandingLink[] = fi
		? [
				{ label: "Kumppanit", href: "/affiliate", external: false },
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

	useEffect(
		() =>
			scheduleLandingSeppoAutoOpen(sessionStorage, () => setSeppoOpen(true)),
		[],
	);

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
							<span className={eyebrow}>
								{fi
									? "Tekijöille, jotka maksavat OBS:n vuokraa"
									: "For creators paying rent on OBS"}
							</span>
							<h1 className="font-display font-semibold text-5xl uppercase leading-[0.92] tracking-tight sm:text-6xl md:text-[4.75rem]">
								{fi ? "Oma OBS." : "Your OBS."}
								<br />
								{fi ? "Oma laitteisto." : "Your hardware."}
								<br />
								{fi ? "Ei pilvistudiolaskua." : "No cloud studio bill."}
							</h1>
							<p className="max-w-md text-lg text-muted-foreground leading-relaxed">
								{fi
									? "Lähetä puhelimen tai selaimen syöte VISPin kautta omalla tietokoneellasi pyörivään OBS:ään. Pidä kohtaukset, grafiikat ja hallinta — älä 120–180 dollarin kuukausilaskua."
									: "Send phone and browser feeds through VISP to OBS running on your own computer. Keep your scenes, overlays, and control — not the $120–180 monthly bill."}
							</p>
							<p className="font-display font-semibold text-2xl uppercase tracking-tight">
								{fi
									? "Säästä 1 440–2 160 $ vuodessa"
									: "Save $1,440–$2,160 a year"}
							</p>
						</div>

						{/* Product shots — real captures, reframed in hairline device slabs */}
						<div className="flex justify-center gap-3 md:justify-end">
							{localizedShots.map((shot, i) => (
								<figure
									key={shot.src}
									className="relative w-1/3 max-w-[140px] overflow-hidden rounded-[10px] border border-border bg-card"
									style={{
										transform: `translateY(${i === 1 ? -14 : 0}px)`,
									}}
								>
									<img
										src={shot.src}
										alt={shot.alt}
										width={560}
										height={996}
										// Hero shots are the mobile LCP element — lazy defers them
										// behind everything else and tanks LCP.
										loading="eager"
										fetchPriority={i === 0 ? "high" : "auto"}
										decoding="async"
										className="aspect-[9/16] w-full object-cover"
									/>
									<figcaption className="absolute top-2 left-2 rounded-sm bg-background/85 px-1.5 py-0.5 font-mono text-[10px] text-foreground uppercase tracking-wider backdrop-blur-sm">
										{shot.tag}
									</figcaption>
								</figure>
							))}
						</div>
					</section>

					{/* Signature: the signal chain */}
					<section className="border-border border-y py-14">
						<span className={eyebrow}>
							{fi ? "Signaaliketju" : "Signal chain"}
						</span>
						<div className="mt-8">
							<SignalChain locale={locale} />
						</div>
						<p className="mt-6 max-w-xl text-muted-foreground text-sm leading-relaxed">
							{fi
								? "Kentällä oleva puhelin tai selain yhdistyy VISP-relayhin. Oma OBS-studiosi vastaanottaa syötteen, tuottaa ohjelman ja lähettää sen valitsemallesi alustalle."
								: "Your phone or browser connects to the VISP relay. Your home OBS receives the feed, produces the show, and sends it to the platform you choose."}
						</p>
					</section>

					{/* Channels */}
					<section className="py-20">
						<h2 className="max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl">
							{fi
								? "Pilvi ei omista studiotasi."
								: "The cloud doesn't own your studio."}
							<br />
							{fi
								? "Sinä omistat jo tarvitsemasi."
								: "You already own what you need."}
						</h2>
						<h3 className="mt-14 mb-4 font-display font-semibold text-2xl uppercase leading-none tracking-tight">
							{fi ? "Mitä pidät" : "What you keep"}
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
								? "Vaihda pilvi-OBS omaan OBS:ääsi"
								: "Move cloud OBS back to your OBS"}
						</h2>
						<p className="mt-6 max-w-2xl text-muted-foreground leading-relaxed">
							{fi
								? "Pilvi-OBS vuokraa sinulle etäkoneen ja valmiin tuotantoympäristön. Jos sinulla on jo OBS:ää pyörittävä tietokone, maksat samasta kapasiteetista kahdesti. VISP kuljettaa kenttäsyötteen omaan studioosi."
								: "Cloud OBS rents you a remote computer and production environment. If you already own a machine that runs OBS, you are paying twice for the same capacity. VISP carries the field feed to the studio you own."}
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
								? "Pidä studio. Pudota tilaus."
								: "Keep the studio. Drop the subscription."}
						</span>
						<h2 className="mt-5 font-display font-semibold text-6xl uppercase leading-none tracking-tight sm:text-7xl">
							{fi ? "Tuo OBS takaisin kotiin" : "Bring OBS back home"}
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
								"Voiko VISP korvata pilvi-OBS:n?",
								"Kuinka paljon säästäisin?",
								"Miten yhdistän kodin OBS:n?",
							]
						: LANDING_SEPPO_SUGGESTIONS
				}
				welcome={
					fi
						? "Hei, olen Seppo. Kysy, miten vaihdat pilvi-OBS:n omalla laitteistollasi pyörivään OBS:ään, mitä tarvitset tai kuinka paljon voit säästää."
						: "Hi, I'm Seppo. Ask how to replace cloud OBS with OBS on hardware you own, what you need, or how much you could save."
				}
				onOpenChange={setSeppoOpen}
			/>
		</>
	);
}
