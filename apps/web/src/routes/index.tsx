import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { MeterMark } from "@/components/meter-mark";
import { SeppoWidget } from "@/components/seppo-widget";
import { authClient } from "@/lib/auth-client";
import { type Locale, localeSearch, localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";
import { scheduleLandingSeppoAutoOpen } from "@/lib/seppo-landing";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "VISP — streaming without the leash" },
			{
				name: "description",
				content:
					"Stream from a phone or browser straight to Twitch or Kick. Add OBS when you need monitoring, recording, or scenes.",
			},
			{ property: "og:locale", content: "en_US" },
		],
		links: localizedHead("en"),
	}),
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

// The signature: source → relay → Direct → platform as one precise patch diagram.
const CHAIN = [
	{ x: 120, tag: "SOURCE", label: "phone/browser" },
	{ x: 380, tag: "RELAY", label: "visp" },
	{ x: 640, tag: "DIRECT", label: "encode" },
	{ x: 900, tag: "OUT", label: "twitch/kick" },
] as const;

function SignalChain({ locale }: { locale: Locale }) {
	const labels =
		locale === "fi"
			? ["puhelin/selain", "visp", "koodaus", "twitch/kick"]
			: CHAIN.map((item) => item.label);
	return (
		<svg
			role="img"
			aria-label={
				locale === "fi"
					? "Signaaliketju puhelimen kamerasta sovelluksen kautta kodin OBS-studioon ja suoratoistopalveluihin."
					: "Signal chain: phone or browser through the VISP relay and Direct to Twitch or Kick, with OBS optional."
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
		src: "/marketing/app-live.png",
		alt: "Live control with OBS status",
		tag: "LIVE",
	},
	{
		src: "/marketing/app-obs-control.png",
		alt: "Ready to go live with chat overlay",
		tag: "READY",
	},
	{
		src: "/marketing/app-settings.png",
		alt: "Camera settings — resolution, frame rate, relay",
		tag: "CONFIG",
	},
] as const;

// Features as channel strips: the mono tag is the signal-path capability,
// not decoration. No 01/02/03 — these are channels, not a sequence.
const channels = [
	{
		tag: "CAM",
		title: "Two cameras, one stream",
		body: "Publish from the VISP mobile app or browser. The newest offline device takes Direct ownership when it goes live.",
	},
	{
		tag: "OBS",
		title: "OBS when you need it",
		body: "Add the contribution feed to OBS for monitoring, recording, scenes, or multi-camera production without changing the Direct platform encode.",
	},
	{
		tag: "NET",
		title: "Capacity before capture",
		body: "VISP checks authorization, ownership, and relay encoder capacity before the publisher starts.",
	},
	{
		tag: "KEY",
		title: "No key pasting",
		body: "VISP retrieves the Twitch or Kick stream key through OAuth only while starting Direct output and never returns it to the publisher.",
	},
];

type LandingLink = {
	label: string;
	href: string;
	external: boolean;
	search?: { lang: "fi" };
};

const footerLinks: LandingLink[] = [
	{ label: "Blog", href: "/blog", external: false },
	{ label: "Docs", href: legalEntity.docsUrl, external: true },
	{ label: "Download", href: "/download", external: false },
	{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
	{ label: "Privacy", href: "/privacy", external: false },
	{ label: "Contact", href: "/contact", external: false },
	{ label: "Terms", href: "/terms", external: false },
	{ label: "Cookies", href: "/cookies", external: false },
];

const navLinks: LandingLink[] = [
	{ label: "Blog", href: "/blog", external: false },
	{ label: "Docs", href: legalEntity.docsUrl, external: true },
	{ label: "Download", href: "/download", external: false },
	{ label: "GitHub", href: legalEntity.sourceUrl, external: true },
	{ label: "Contact", href: "/contact", external: false },
];

const LANDING_SEPPO_SUGGESTIONS = [
	"What is VISP for?",
	"Can I use my phone with OBS?",
	"What do I need to get started?",
];

const eyebrow =
	"font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground";

export function HomeComponent({ locale }: { locale: Locale }) {
	const [seppoOpen, setSeppoOpen] = useState(false);
	const fi = locale === "fi";
	const localizedChannels = fi
		? [
				{
					tag: "CAM",
					title: "Puhelin tai selain lähteenä",
					body: "Julkaise VISP-mobiilisovelluksella tai selaimella. Uusin offline-laite saa Direct-omistajuuden aloittaessaan.",
				},
				{
					tag: "OBS",
					title: "OBS tarvittaessa",
					body: "Lisää alkuperäinen syöte OBS:ään valvontaa, tallennusta, kohtauksia tai monikameratuotantoa varten.",
				},
				{
					tag: "NET",
					title: "Kapasiteetti tarkistetaan ensin",
					body: "VISP tarkistaa valtuutuksen, omistajuuden ja relayn koodauskapasiteetin ennen julkaisun aloitusta.",
				},
				{
					tag: "KEY",
					title: "Ei lähetysavaimen liittämistä",
					body: "VISP hakee Twitchin tai Kickin lähetysavaimen OAuth-luvalla vain Direct-lähdön käynnistämiseksi eikä palauta sitä julkaisijalle.",
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
							<h1 className="font-display font-semibold text-6xl uppercase leading-[0.92] tracking-tight sm:text-7xl md:text-[5.5rem]">
								{fi ? "Livetä" : "Go live from"}
								<br />
								{fi ? "mistä tahansa" : "anywhere"}
							</h1>
							<p className="max-w-md text-lg text-muted-foreground leading-relaxed">
								{fi
									? "Lähetä puhelimesta tai selaimesta VISP-relayn kautta suoraan Twitchiin tai Kickiin. Lisää sama syöte OBS:ään vain tarvittaessa."
									: "Stream from a phone or browser through the VISP relay straight to Twitch or Kick. Add the same feed to OBS only when you need it."}
							</p>
							<p className="font-medium text-base">
								{fi ? "Helposti parempi" : "Full production. Zero leash."}
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
										loading="lazy"
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
								? "Lähde yhdistyy relayhin, ja Direct lähettää Twitchiin tai Kickiin. OBS on valinnainen."
								: "The source connects to the relay, and Direct sends to Twitch or Kick. OBS is optional."}
						</p>
					</section>

					{/* Channels */}
					<section className="py-20">
						<h2 className="max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl">
							{fi ? "Ei ehkä kaikille." : "Not for everyone."}
							<br />
							{fi
								? "Mutta tekijöille, jotka haluavat enemmän."
								: "For creators who want more."}
						</h2>
						<h3 className="mt-14 mb-4 font-display font-semibold text-2xl uppercase leading-none tracking-tight">
							{fi ? "Käyttötarkoituksia" : "Use cases"}
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

					{/* Closing CTA */}
					<section className="border-border border-t py-24 text-center">
						<span className={eyebrow}>{fi ? "" : "Join the beta"}</span>
						<h2 className="mt-5 font-display font-semibold text-6xl uppercase leading-none tracking-tight sm:text-7xl">
							{fi ? "Liity betaan" : "It's free"}
						</h2>
						<div className="mt-8 flex flex-col items-center gap-3">
							<TryCta locale={locale} size="lg" />
							<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
								{fi
									? "Käyttöönotto vaatii kolme kysymystä, ei kolmea viikonloppua. Puhelinsovellukset, selainjulkaisu ja OBS-lisäosa "
									: "Setup takes three questions, not three weekends. Phone apps, browser publisher, and OBS plugin — "}
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
								"Mihin VISPiä käytetään?",
								"Voinko käyttää puhelintani OBS:n kanssa?",
								"Mitä tarvitsen aloittamiseen?",
							]
						: LANDING_SEPPO_SUGGESTIONS
				}
				welcome={
					fi
						? "Hei, olen Seppo. Mietitkö, sopiiko VISP lähetykseesi? Kysy, mitä se tekee, mitä tarvitset tai miten puhelimet ja etävieraat yhdistetään OBS:ään."
						: "Hi, I'm Seppo. Ask how Direct sends a phone or browser to Twitch or Kick, or how to add OBS afterward."
				}
				onOpenChange={setSeppoOpen}
			/>
		</>
	);
}
