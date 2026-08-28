import { Button, buttonVariants } from "@VISP/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import { Input } from "@VISP/ui/components/input";
import { Textarea } from "@VISP/ui/components/textarea";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { type Locale, localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";
import { useTRPC } from "@/utils/trpc";

const copy = {
	en: {
		title: "VISP Founding Creator Program",
		description:
			"Five IRL streaming creators get VISP Pro free for life in exchange for testing VISP on real hardware and publishing an honest verdict. No script, no commission promises.",
		eyebrow: "Founding creators",
		heading: "VISP founding creator program",
		intro:
			"Five creators get VISP Pro free for life. In exchange: test VISP on your own rig and tell us — and your viewers — the truth about it.",
		cta: "Apply to the pilot",
		offerEyebrow: "The pilot offer",
		offerHeading: "Built for people who actually test gear",
		offers: [
			[
				"Free Pro, for life",
				"When VISP Pro launches, founding creators keep it free permanently. No renewal, no expiry, no card on file.",
			],
			[
				"Real hardware, early",
				"Run VISP on your own phone, backpack, encoder, and OBS workflow before anyone else does.",
			],
			[
				"Your honest verdict",
				"No script, no approval over your conclusion, no positive-review clause. We only check factual product details.",
			],
		],
		fitHeading: "Who should apply",
		fitIntro:
			"We are looking for YouTube creators who test IRL streaming gear in real conditions and help viewers make informed setup decisions.",
		fitList: [
			"IRL backpack and mobile streaming builders",
			"SRT, SRTLA, BELABOX, Moblin, and bonding reviewers",
			"Remote OBS and mobile production educators",
			"Creators with engaged setup and buying questions",
		],
		fitNote:
			"A focused audience beats a large generic one. There is no minimum subscriber count for the pilot.",
		processHeading: "How it works",
		process: [
			["01", "Apply", "Share your channel and one relevant build or review."],
			[
				"02",
				"Test",
				"A technical onboarding session and an account with everything unlocked.",
			],
			[
				"03",
				"Tell us what breaks",
				"The point of a pilot is finding the problems before launch, not after.",
			],
			[
				"04",
				"Keep Pro",
				"Free for as long as VISP exists, whatever you conclude about it.",
			],
		],
		moneyHeading: "What about commission?",
		moneyBody: [
			"There is no revenue share today. VISP Pro is not built yet, there is no billing behind it, and we are not going to promise you a percentage of a number that does not exist.",
			"If VISP launches an affiliate program later, founding creators hear about it first. Until then the deal is exactly what is above: free Pro for life, early hardware access, and your own honest verdict.",
		],
		applyHeading: "Apply to the founding creator pilot",
		applyIntro:
			"The pilot is limited to five creators. Tell us about your channel and one relevant build or review.",
		faqHeading: "Founding creator FAQ",
		faq: [
			{
				question: "Who can apply to the VISP founding creator program?",
				answer:
					"YouTube creators who publish hands-on IRL streaming backpacks, mobile bonding, SRT, remote OBS, or related hardware and setup content can apply. Audience fit and trust matter more than subscriber count.",
			},
			{
				question: "Do founding creators earn commission?",
				answer:
					"Not today. VISP Pro does not exist yet and there is no billing to pay commission from, so we do not advertise a rate. Founding creators get VISP Pro free for life instead, and hear first if an affiliate program launches later.",
			},
			{
				question: "Do I have to publish a positive review?",
				answer:
					"No. VISP does not require a script or a positive conclusion. We may check factual details, but your review and recommendation remain yours. You keep free Pro either way.",
			},
			{
				question: "Is VISP Pro available now?",
				answer:
					"Not yet — VISP is free during the beta and Pro is upcoming. We are selecting a small group of creators now so they have time to test VISP on real streaming hardware before launch.",
			},
		],
		form: {
			name: "Name",
			email: "Email",
			channel: "YouTube channel URL",
			video: "Relevant video or build URL",
			videoPlaceholder: "https://youtube.com/watch?v=…",
			setup: "Tell us about your audience and streaming setup",
			setupPlaceholder: "What do you build, test, and help viewers choose?",
			disclosure:
				"I will clearly disclose that I received VISP Pro for free in any content covering VISP, and follow YouTube’s paid-promotion rules.",
			submit: "Send application",
			sending: "Sending…",
			privacy:
				"We use these details only to review and respond to your application. See our ",
			privacyLink: "Privacy Policy",
			hidden: "Leave this field blank",
			receivedTitle: "Application received.",
			receivedBody: "We’ll review your channel and reply by email.",
		},
	},
	fi: {
		title: "VISPin perustajaohjelma sisällöntuottajille",
		description:
			"Viisi IRL-striimauksen sisällöntuottajaa saa VISP Pron pysyvästi maksutta vastineeksi testauksesta oikealla kalustolla ja rehellisestä arviosta. Ei käsikirjoitusta eikä komissiolupauksia.",
		eyebrow: "Perustajakumppanit",
		heading: "VISPin perustajaohjelma",
		intro:
			"Viisi tekijää saa VISP Pron pysyvästi maksutta. Vastineeksi: testaat VISPiä omalla kalustollasi ja kerrot meille — ja katsojillesi — totuuden siitä.",
		cta: "Hae pilottiin",
		offerEyebrow: "Pilotin tarjous",
		offerHeading: "Tehty niille, jotka oikeasti testaavat kalustoa",
		offers: [
			[
				"Pro maksutta, pysyvästi",
				"Kun VISP Pro julkaistaan, perustajat pitävät sen pysyvästi maksutta. Ei uusimista, ei vanhenemista, ei korttitietoja.",
			],
			[
				"Oikea kalusto, ensimmäisenä",
				"Aja VISPiä omalla puhelimella, repulla, enkooderilla ja OBS-työnkululla ennen muita.",
			],
			[
				"Oma rehellinen arviosi",
				"Ei käsikirjoitusta, ei hyväksyntää lopputulokselle, ei vaatimusta positiivisesta arviosta. Tarkistamme vain tuotetietojen paikkansapitävyyden.",
			],
		],
		fitHeading: "Kenen kannattaa hakea",
		fitIntro:
			"Etsimme YouTube-tekijöitä, jotka testaavat IRL-striimauskalustoa oikeissa olosuhteissa ja auttavat katsojia tekemään perusteltuja hankintapäätöksiä.",
		fitList: [
			"IRL-reppujen ja mobiilistriimauksen rakentajat",
			"SRT-, SRTLA-, BELABOX-, Moblin- ja bonding-arvioijat",
			"Etä-OBS:n ja mobiilituotannon opettajat",
			"Tekijät, joiden yleisö kysyy kalusto- ja hankintakysymyksiä",
		],
		fitNote:
			"Tarkkaan rajattu yleisö on parempi kuin suuri ja yleinen. Pilotissa ei ole tilaajamäärän alarajaa.",
		processHeading: "Näin se toimii",
		process: [
			[
				"01",
				"Hae",
				"Kerro kanavastasi ja yhdestä olennaisesta rakennus- tai arviovideosta.",
			],
			[
				"02",
				"Testaa",
				"Tekninen perehdytys ja tili, jossa kaikki ominaisuudet ovat auki.",
			],
			[
				"03",
				"Kerro mikä hajoaa",
				"Pilotin tarkoitus on löytää ongelmat ennen julkaisua, ei sen jälkeen.",
			],
			[
				"04",
				"Pidä Pro",
				"Maksutta niin kauan kuin VISP on olemassa, päädyit arviossasi mihin tahansa.",
			],
		],
		moneyHeading: "Entä komissio?",
		moneyBody: [
			"Tulonjakoa ei tällä hetkellä ole. VISP Prota ei ole vielä rakennettu, sen takana ei ole laskutusta, emmekä lupaa sinulle prosenttiosuutta luvusta jota ei ole olemassa.",
			"Jos VISP käynnistää affiliate-ohjelman myöhemmin, perustajat kuulevat siitä ensimmäisenä. Siihen asti sopimus on täsmälleen yllä kuvattu: Pro maksutta pysyvästi, kalusto käyttöön ensimmäisenä ja oma rehellinen arviosi.",
		],
		applyHeading: "Hae perustajapilottiin",
		applyIntro:
			"Pilottiin otetaan viisi tekijää. Kerro kanavastasi ja yhdestä olennaisesta rakennus- tai arviovideosta.",
		faqHeading: "Usein kysyttyä perustajaohjelmasta",
		faq: [
			{
				question: "Kuka voi hakea VISPin perustajaohjelmaan?",
				answer:
					"Hakea voivat YouTube-tekijät, jotka julkaisevat käytännönläheistä sisältöä IRL-strimausrepuista, mobiilibondingista, SRT:stä, etä-OBS:stä tai muusta vastaavasta kalustosta ja käyttöönotosta. Yleisön sopivuus ja luottamus painavat enemmän kuin tilaajamäärä.",
			},
			{
				question: "Saavatko perustajat komissiota?",
				answer:
					"Eivät tällä hetkellä. VISP Prota ei vielä ole eikä laskutusta, josta komissio maksettaisiin, joten emme mainosta mitään prosenttia. Perustajat saavat sen sijaan VISP Pron pysyvästi maksutta ja kuulevat ensimmäisenä, jos affiliate-ohjelma joskus käynnistyy.",
			},
			{
				question: "Pitääkö arvion olla positiivinen?",
				answer:
					"Ei. VISP ei vaadi käsikirjoitusta eikä tiettyä lopputulosta. Voimme tarkistaa tuotetietojen paikkansapitävyyden, mutta arvio ja suositus ovat sinun. Pro pysyy maksuttomana lopputuloksesta riippumatta.",
			},
			{
				question: "Onko VISP Pro jo saatavilla?",
				answer:
					"Ei vielä — VISP on betan ajan maksuton ja Pro on tulossa. Valitsemme tekijät nyt, jotta heillä on aikaa testata VISPiä oikealla striimauskalustolla ennen julkaisua.",
			},
		],
		form: {
			name: "Nimi",
			email: "Sähköposti",
			channel: "YouTube-kanavan osoite",
			video: "Olennaisen videon tai rakennelman osoite",
			videoPlaceholder: "https://youtube.com/watch?v=…",
			setup: "Kerro yleisöstäsi ja striimauskalustostasi",
			setupPlaceholder:
				"Mitä rakennat, mitä testaat ja missä autat katsojia valitsemaan?",
			disclosure:
				"Kerron VISPiä käsittelevässä sisällössäni selkeästi saaneeni VISP Pron maksutta ja noudatan YouTuben kaupallisen yhteistyön sääntöjä.",
			submit: "Lähetä hakemus",
			sending: "Lähetetään…",
			privacy:
				"Käytämme näitä tietoja vain hakemuksen käsittelyyn ja siihen vastaamiseen. Katso ",
			privacyLink: "tietosuojaseloste",
			hidden: "Jätä tämä kenttä tyhjäksi",
			receivedTitle: "Hakemus vastaanotettu.",
			receivedBody: "Käymme kanavasi läpi ja vastaamme sähköpostitse.",
		},
	},
} as const;

export function affiliateHead(locale: Locale) {
	const text = copy[locale];
	const path = locale === "fi" ? "/fi/affiliate" : "/affiliate";
	return {
		meta: [
			{ title: text.title },
			{ name: "description", content: text.description },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "VISP" },
			{ property: "og:title", content: text.title },
			{ property: "og:description", content: text.description },
			{ property: "og:url", content: `${legalEntity.siteUrl}${path}` },
			{ property: "og:image", content: `${legalEntity.siteUrl}/og-card.png` },
			{ property: "og:locale", content: locale === "fi" ? "fi_FI" : "en_US" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: text.title },
			{ name: "twitter:description", content: text.description },
		],
		links: localizedHead(locale, path),
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "FAQPage",
					inLanguage: locale,
					mainEntity: text.faq.map(({ question, answer }) => ({
						"@type": "Question",
						name: question,
						acceptedAnswer: { "@type": "Answer", text: answer },
					})),
				}),
			},
		],
	};
}

export const Route = createFileRoute("/affiliate")({
	head: () => affiliateHead("en"),
	component: () => <AffiliatePage locale="en" />,
});

export function AffiliatePage({ locale }: { locale: Locale }) {
	const text = copy[locale];
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-12 sm:py-16">
			<header className="flex flex-col items-start gap-5">
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					{text.eyebrow}
				</p>
				<h1 className="max-w-4xl font-bold font-display text-5xl uppercase leading-none tracking-tight sm:text-7xl">
					{text.heading}
				</h1>
				<p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
					{text.intro}
				</p>
				<a className={buttonVariants({ size: "lg" })} href="#apply">
					{text.cta}
				</a>
			</header>

			<section aria-labelledby="offer-title" className="flex flex-col gap-6">
				<div>
					<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
						{text.offerEyebrow}
					</p>
					<h2
						id="offer-title"
						className="mt-2 font-display font-semibold text-4xl uppercase tracking-tight"
					>
						{text.offerHeading}
					</h2>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					{text.offers.map(([heading, body]) => (
						<Card key={heading}>
							<CardHeader>
								<CardTitle>{heading}</CardTitle>
								<CardDescription>{body}</CardDescription>
							</CardHeader>
						</Card>
					))}
				</div>
			</section>

			<div className="grid gap-12 lg:grid-cols-2">
				<section aria-labelledby="fit-title" className="flex flex-col gap-5">
					<h2
						id="fit-title"
						className="font-display font-semibold text-3xl uppercase tracking-tight"
					>
						{text.fitHeading}
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						{text.fitIntro}
					</p>
					<ul className="list-square space-y-3 pl-5 text-muted-foreground">
						{text.fitList.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
					<p className="border-border border-l-2 pl-4 text-muted-foreground text-sm">
						{text.fitNote}
					</p>
				</section>

				<section
					aria-labelledby="process-title"
					className="flex flex-col gap-5"
				>
					<h2
						id="process-title"
						className="font-display font-semibold text-3xl uppercase tracking-tight"
					>
						{text.processHeading}
					</h2>
					<ol className="space-y-5">
						{text.process.map(([number, heading, body]) => (
							<li key={number} className="flex gap-4">
								<span className="font-mono text-muted-foreground text-xs">
									{number}
								</span>
								<div>
									<h3 className="font-medium">{heading}</h3>
									<p className="mt-1 text-muted-foreground text-sm">{body}</p>
								</div>
							</li>
						))}
					</ol>
				</section>
			</div>

			{/* The old page led with "25% recurring" on a tier that does not exist
			    yet. Saying so plainly is the point of this section. */}
			<section
				aria-labelledby="money-title"
				className="border-border border-l-2 pl-6"
			>
				<h2
					id="money-title"
					className="font-display font-semibold text-3xl uppercase tracking-tight"
				>
					{text.moneyHeading}
				</h2>
				{text.moneyBody.map((paragraph) => (
					<p
						key={paragraph}
						className="mt-4 max-w-2xl text-muted-foreground leading-relaxed"
					>
						{paragraph}
					</p>
				))}
			</section>

			<section id="apply" aria-labelledby="apply-title" className="scroll-mt-8">
				<Card>
					<CardHeader>
						<CardTitle id="apply-title" className="text-3xl">
							{text.applyHeading}
						</CardTitle>
						<CardDescription>{text.applyIntro}</CardDescription>
					</CardHeader>
					<CardContent>
						<ApplicationForm locale={locale} />
					</CardContent>
				</Card>
			</section>

			<section aria-labelledby="faq-title" className="flex flex-col gap-6">
				<h2
					id="faq-title"
					className="font-display font-semibold text-4xl uppercase tracking-tight"
				>
					{text.faqHeading}
				</h2>
				<div className="grid gap-6 sm:grid-cols-2">
					{text.faq.map(({ question, answer }) => (
						<div key={question}>
							<h3 className="font-medium">{question}</h3>
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
								{answer}
							</p>
						</div>
					))}
				</div>
			</section>
		</main>
	);
}

function ApplicationForm({ locale }: { locale: Locale }) {
	const text = copy[locale].form;
	const trpc = useTRPC();
	const [submitted, setSubmitted] = useState(false);
	const application = useMutation(trpc.affiliate.submit.mutationOptions());

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = event.currentTarget;
		const answers = new FormData(form);
		const disclosureAccepted = answers.has("disclosureAccepted");
		if (!disclosureAccepted) return;
		try {
			await application.mutateAsync({
				applicantName: String(answers.get("applicantName") ?? ""),
				email: String(answers.get("email") ?? ""),
				youtubeChannelUrl: String(answers.get("youtubeChannelUrl") ?? ""),
				relevantVideoUrl: String(answers.get("relevantVideoUrl") ?? ""),
				audienceAndSetup: String(answers.get("audienceAndSetup") ?? ""),
				disclosureAccepted,
				website: String(answers.get("website") ?? ""),
			});
			form.reset();
			setSubmitted(true);
		} catch {
			// The mutation error is rendered below the form.
		}
	}

	if (submitted) {
		return (
			<div role="status" className="border border-signal/40 bg-signal/5 p-5">
				<p className="font-medium">{text.receivedTitle}</p>
				<p className="mt-1 text-muted-foreground text-sm">
					{text.receivedBody}
				</p>
			</div>
		);
	}

	return (
		<form onSubmit={submit} className="relative grid gap-5" data-pii>
			<div
				aria-hidden="true"
				className="absolute -left-[10000px] size-px overflow-hidden"
			>
				<label htmlFor="affiliate-website">{text.hidden}</label>
				<Input
					id="affiliate-website"
					name="website"
					tabIndex={-1}
					autoComplete="off"
				/>
			</div>
			<div className="grid gap-5 sm:grid-cols-2">
				<label htmlFor="affiliate-name" className="grid gap-2 text-sm">
					<span>{text.name}</span>
					<Input
						id="affiliate-name"
						name="applicantName"
						autoComplete="name"
						maxLength={120}
						required
					/>
				</label>
				<label htmlFor="affiliate-email" className="grid gap-2 text-sm">
					<span>{text.email}</span>
					<Input
						id="affiliate-email"
						name="email"
						type="email"
						autoComplete="email"
						maxLength={320}
						required
					/>
				</label>
			</div>
			<label htmlFor="affiliate-channel" className="grid gap-2 text-sm">
				<span>{text.channel}</span>
				<Input
					id="affiliate-channel"
					name="youtubeChannelUrl"
					type="url"
					maxLength={2048}
					placeholder="https://youtube.com/@yourchannel"
					required
				/>
			</label>
			<label htmlFor="affiliate-video" className="grid gap-2 text-sm">
				<span>{text.video}</span>
				<Input
					id="affiliate-video"
					name="relevantVideoUrl"
					type="url"
					maxLength={2048}
					placeholder={text.videoPlaceholder}
					required
				/>
			</label>
			<label htmlFor="affiliate-setup" className="grid gap-2 text-sm">
				<span>{text.setup}</span>
				<Textarea
					id="affiliate-setup"
					name="audienceAndSetup"
					rows={5}
					maxLength={4000}
					placeholder={text.setupPlaceholder}
					required
				/>
			</label>
			<label className="flex items-start gap-3 text-muted-foreground text-sm">
				<input
					className="mt-1 size-4 accent-primary"
					name="disclosureAccepted"
					type="checkbox"
					required
				/>
				<span>{text.disclosure}</span>
			</label>
			<div className="flex flex-wrap items-center gap-4">
				<Button type="submit" size="lg" disabled={application.isPending}>
					{application.isPending ? text.sending : text.submit}
				</Button>
				<p className="text-muted-foreground text-xs">
					{text.privacy}
					<Link to={locale === "fi" ? "/fi/privacy" : "/privacy"}>
						{text.privacyLink}
					</Link>
					.
				</p>
			</div>
			{application.error ? (
				<p role="alert" className="text-destructive text-sm">
					{application.error.message}
				</p>
			) : null}
		</form>
	);
}
