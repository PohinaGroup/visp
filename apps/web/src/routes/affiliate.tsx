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

import { PageHeader } from "@/components/page-header";
import { type Locale, localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";
import { useTRPC } from "@/utils/trpc";

const copy = {
	en: {
		title: "VISP Affiliate program",
		description:
			"Creators with an audience get every VISP feature free, Plus quotas apply. The current intake is five founding creators who test VISP on real hardware and publish an honest verdict. No script, no commission promises.",
		eyebrow: "Affiliate program",
		heading: "VISP Affiliate program",
		intro:
			"Creators with an audience get every VISP feature free, Plus quotas apply. The current intake is five founding creators: test VISP on your own rig and tell us and your viewers the truth about it.",
		cta: "Apply",
		offerEyebrow: "The offer",
		offerHeading: "Built for people who actually test gear",
		offers: [
			[
				"Every feature free",
				"Plus costs €9 a month. Affiliate creators get it free, and the five founding creators keep it free permanently: no renewal, no expiry, no card on file. Plus quotas apply.",
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
			"A focused audience beats a large generic one. There is no minimum subscriber count.",
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
				"The founding intake exists to find the problems while the group is small.",
			],
			[
				"04",
				"Keep every feature",
				"Free for as long as VISP exists, whatever you conclude about it. Plus quotas apply.",
			],
		],
		moneyHeading: "What about commission?",
		moneyBody: [
			"There is no revenue share today. Plus costs €9 a month, but we have chosen not to pay commission on it yet, and we are not going to promise you a percentage before we know what a fair one is.",
			"If VISP starts paying commission later, Affiliate creators hear about it first. Until then the deal is exactly what is above: every feature free, early hardware access, and your own honest verdict.",
		],
		applyHeading: "Apply to the Affiliate program",
		applyIntro:
			"The current intake is five founding creators. Tell us about your channel and one relevant build or review.",
		faqHeading: "Affiliate program FAQ",
		faq: [
			{
				question: "Who can apply to the VISP Affiliate program?",
				answer:
					"YouTube creators who publish hands-on IRL streaming backpacks, mobile bonding, SRT, remote OBS, or related hardware and setup content can apply. Audience fit and trust matter more than subscriber count.",
			},
			{
				question: "Does the program pay commission?",
				answer:
					"Not today. We have chosen not to pay commission yet, so we do not advertise a rate. Affiliate creators get every feature free instead, Plus quotas apply, and hear first if that changes.",
			},
			{
				question: "What are the five founding slots?",
				answer:
					"The first intake of the Affiliate program. Five creators get onboarded now, before the program opens wider, and keep every feature free for as long as VISP exists. Later intakes get the same offer, Plus quotas apply.",
			},
			{
				question: "Do I have to publish a positive review?",
				answer:
					"No. VISP does not require a script or a positive conclusion. We may check factual details, but your review and recommendation remain yours. You keep every feature free either way.",
			},
			{
				question: "What does VISP cost?",
				answer:
					"VISP is free, and Direct stays free with no usage cap. Plus costs €9 a month (VAT included) and adds hosted voice, captions, and audio isolation, and lets your BRB card play your uploaded highlight clips. Affiliate creators get every feature free, Plus quotas apply.",
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
				"I will clearly disclose that I received VISP Plus for free in any content covering VISP, and follow YouTube’s paid-promotion rules.",
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
		title: "VISPin Affiliate-ohjelma",
		description:
			"Yleisöä keränneet tekijät saavat kaikki VISPin ominaisuudet maksutta, Plus-kiintiöt pätevät. Nyt haussa on viisi perustajaa, jotka testaavat VISPiä oikealla kalustolla ja julkaisevat rehellisen arvion. Ei käsikirjoitusta eikä komissiolupauksia.",
		eyebrow: "Affiliate-ohjelma",
		heading: "VISPin Affiliate-ohjelma",
		intro:
			"Yleisöä keränneet tekijät saavat kaikki VISPin ominaisuudet maksutta, Plus-kiintiöt pätevät. Nyt haussa on viisi perustajaa: testaa VISPiä omalla kalustollasi ja kerro meille ja katsojillesi totuus siitä.",
		cta: "Hae",
		offerEyebrow: "Tarjous",
		offerHeading: "Tehty niille, jotka oikeasti testaavat kalustoa",
		offers: [
			[
				"Kaikki ominaisuudet maksutta",
				"Plus maksaa 9 euroa kuukaudessa. Affiliate-tekijät saavat sen maksutta, ja viisi perustajaa pitävät sen pysyvästi: ei uusimista, ei vanhenemista, ei korttitietoja. Plus-kiintiöt pätevät.",
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
			"Tarkkaan rajattu yleisö on parempi kuin suuri ja yleinen. Tilaajamäärälle ei ole alarajaa.",
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
				"Perustajahaun tarkoitus on löytää ongelmat, kun joukko on vielä pieni.",
			],
			[
				"04",
				"Pidä kaikki ominaisuudet",
				"Maksutta niin kauan kuin VISP on olemassa, päädyit arviossasi mihin tahansa. Plus-kiintiöt pätevät.",
			],
		],
		moneyHeading: "Entä komissio?",
		moneyBody: [
			"Tulonjakoa ei tällä hetkellä ole. Plus maksaa 9 euroa kuukaudessa, mutta olemme päättäneet olla maksamatta siitä komissiota toistaiseksi, emmekä lupaa sinulle prosenttiosuutta ennen kuin tiedämme, mikä olisi reilu.",
			"Jos VISP alkaa maksaa komissiota myöhemmin, Affiliate-tekijät kuulevat siitä ensimmäisenä. Siihen asti sopimus on täsmälleen yllä kuvattu: kaikki ominaisuudet maksutta, kalusto käyttöön ensimmäisenä ja oma rehellinen arviosi.",
		],
		applyHeading: "Hae Affiliate-ohjelmaan",
		applyIntro:
			"Nyt haussa on viisi perustajaa. Kerro kanavastasi ja yhdestä olennaisesta rakennus- tai arviovideosta.",
		faqHeading: "Usein kysyttyä Affiliate-ohjelmasta",
		faq: [
			{
				question: "Kuka voi hakea VISPin Affiliate-ohjelmaan?",
				answer:
					"Hakea voivat YouTube-tekijät, jotka julkaisevat käytännönläheistä sisältöä IRL-strimausrepuista, mobiilibondingista, SRT:stä, etä-OBS:stä tai muusta vastaavasta kalustosta ja käyttöönotosta. Yleisön sopivuus ja luottamus painavat enemmän kuin tilaajamäärä.",
			},
			{
				question: "Maksetaanko ohjelmassa komissiota?",
				answer:
					"Ei tällä hetkellä. Olemme päättäneet olla maksamatta komissiota toistaiseksi, joten emme mainosta mitään prosenttia. Affiliate-tekijät saavat sen sijaan kaikki ominaisuudet maksutta, Plus-kiintiöt pätevät, ja kuulevat ensimmäisenä, jos tämä muuttuu.",
			},
			{
				question: "Mitä viisi perustajapaikkaa tarkoittavat?",
				answer:
					"Affiliate-ohjelman ensimmäistä hakua. Viisi tekijää perehdytetään nyt, ennen kuin ohjelma avautuu laajemmin, ja he pitävät kaikki ominaisuudet maksutta niin kauan kuin VISP on olemassa. Myöhemmät haut saavat saman tarjouksen, Plus-kiintiöt pätevät.",
			},
			{
				question: "Pitääkö arvion olla positiivinen?",
				answer:
					"Ei. VISP ei vaadi käsikirjoitusta eikä tiettyä lopputulosta. Voimme tarkistaa tuotetietojen paikkansapitävyyden, mutta arvio ja suositus ovat sinun. Kaikki ominaisuudet pysyvät maksuttomina lopputuloksesta riippumatta.",
			},
			{
				question: "Mitä VISP maksaa?",
				answer:
					"VISP on ilmainen, ja Direct pysyy ilmaisena ilman käyttörajaa. Plus maksaa 9 euroa kuukaudessa (sis. ALV) ja lisää palvelimella toimivan puheäänen, tekstityksen ja äänen eristyksen sekä BRB-kortille omat koosteesi. Affiliate-tekijät saavat kaikki ominaisuudet maksutta, Plus-kiintiöt pätevät.",
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
				"Kerron VISPiä käsittelevässä sisällössäni selkeästi saaneeni VISP Plussan maksutta ja noudatan YouTuben kaupallisen yhteistyön sääntöjä.",
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
			<PageHeader
				hero
				eyebrow={text.eyebrow}
				title={text.heading}
				subtitle={text.intro}
			>
				<a
					className={`self-start ${buttonVariants({ size: "lg" })}`}
					href="#apply"
				>
					{text.cta}
				</a>
			</PageHeader>

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

			{/* The old page led with "25% recurring". No commission is paid today;
			    saying so plainly is the point of this section. */}
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
