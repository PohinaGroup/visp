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

import { legalEntity } from "@/lib/legal";
import { useTRPC } from "@/utils/trpc";

const title = "VISP Affiliate Program for IRL Streaming Creators";
const description =
	"Join the VISP affiliate program for YouTube hardware reviewers and IRL streaming creators. Earn 25% recurring commission on referred VISP Pro subscriptions.";
const canonical = `${legalEntity.siteUrl}/affiliate`;

const faq = [
	{
		question: "Who can apply to the VISP affiliate program?",
		answer:
			"YouTube creators who publish hands-on IRL streaming backpacks, mobile bonding, SRT, remote OBS, or related hardware and setup content can apply. Audience fit and trust matter more than subscriber count.",
	},
	{
		question: "How much does the VISP affiliate program pay?",
		answer:
			"Pilot partners earn 25% of net VISP Pro subscription revenue from each referred customer for the customer's first 12 paid months.",
	},
	{
		question: "Do I have to publish a positive review?",
		answer:
			"No. VISP does not require a script or a positive conclusion. We may check factual details, but your review and recommendation remain yours.",
	},
	{
		question: "Is VISP Pro available now?",
		answer:
			"VISP Pro is upcoming. We are selecting a small group of creators now so they have time to test VISP on real streaming hardware before launch.",
	},
] as const;

export const Route = createFileRoute("/affiliate")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "VISP" },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:url", content: canonical },
			{ property: "og:image", content: `${legalEntity.siteUrl}/og-card.png` },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
		],
		links: [{ rel: "canonical", href: canonical }],
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "FAQPage",
					mainEntity: faq.map(({ question, answer }) => ({
						"@type": "Question",
						name: question,
						acceptedAnswer: { "@type": "Answer", text: answer },
					})),
				}),
			},
		],
	}),
	component: AffiliatePage,
});

function AffiliatePage() {
	return (
		<main className="mx-auto flex w-full max-w-5xl flex-col gap-16 px-4 py-12 sm:py-16">
			<header className="flex flex-col items-start gap-5">
				<div aria-hidden className="smpte-bars h-1.5 w-28" />
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.3em]">
					Creator partners
				</p>
				<h1 className="max-w-4xl font-bold font-display text-5xl uppercase leading-none tracking-tight sm:text-7xl">
					VISP affiliate program for IRL streaming creators
				</h1>
				<p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
					Help streamers build better mobile rigs and earn recurring commission
					when your viewers choose the upcoming VISP Pro tier.
				</p>
				<a className={buttonVariants({ size: "lg" })} href="#apply">
					Apply to the pilot
				</a>
			</header>

			<section aria-labelledby="offer-title" className="flex flex-col gap-6">
				<div>
					<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
						The pilot offer
					</p>
					<h2
						id="offer-title"
						className="mt-2 font-display font-semibold text-4xl uppercase tracking-tight"
					>
						Built for trusted hardware reviewers
					</h2>
				</div>
				<div className="grid gap-4 sm:grid-cols-3">
					<Card>
						<CardHeader>
							<CardTitle>25% recurring</CardTitle>
							<CardDescription>
								Earn 25% of net Pro revenue for each referred customer’s first
								12 paid months.
							</CardDescription>
						</CardHeader>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Free Pro access</CardTitle>
							<CardDescription>
								Test VISP on your own phone, backpack, encoder, and OBS workflow
								before sharing it.
							</CardDescription>
						</CardHeader>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Your honest verdict</CardTitle>
							<CardDescription>
								No required script or positive-review clause. VISP only checks
								factual product details.
							</CardDescription>
						</CardHeader>
					</Card>
				</div>
			</section>

			<div className="grid gap-12 lg:grid-cols-2">
				<section aria-labelledby="fit-title" className="flex flex-col gap-5">
					<h2
						id="fit-title"
						className="font-display font-semibold text-3xl uppercase tracking-tight"
					>
						Who should apply
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						We are looking for YouTube creators who test IRL streaming gear in
						real conditions and help viewers make informed setup decisions.
					</p>
					<ul className="list-square space-y-3 pl-5 text-muted-foreground">
						<li>IRL backpack and mobile streaming builders</li>
						<li>SRT, SRTLA, BELABOX, Moblin, and bonding reviewers</li>
						<li>Remote OBS and mobile production educators</li>
						<li>Creators with engaged setup and buying questions</li>
					</ul>
					<p className="border-border border-l-2 pl-4 text-muted-foreground text-sm">
						A focused audience beats a large generic one. There is no minimum
						subscriber count for the pilot.
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
						How it works
					</h2>
					<ol className="space-y-5">
						{[
							[
								"01",
								"Apply",
								"Share your channel and one relevant build or review.",
							],
							[
								"02",
								"Test",
								"Selected creators receive onboarding and complimentary Pro access.",
							],
							[
								"03",
								"Publish",
								"Use your unique link or code wherever VISP genuinely fits your content.",
							],
							[
								"04",
								"Earn",
								"Receive monthly commission after the refund and chargeback hold.",
							],
						].map(([number, heading, body]) => (
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

			<section id="apply" aria-labelledby="apply-title" className="scroll-mt-8">
				<Card>
					<CardHeader>
						<CardTitle id="apply-title" className="text-3xl">
							Apply to the VISP affiliate pilot
						</CardTitle>
						<CardDescription>
							The pilot is limited to five creators. Tell us about your channel
							and one relevant build or review.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ApplicationForm />
					</CardContent>
				</Card>
			</section>

			<section aria-labelledby="faq-title" className="flex flex-col gap-6">
				<h2
					id="faq-title"
					className="font-display font-semibold text-4xl uppercase tracking-tight"
				>
					Affiliate program FAQ
				</h2>
				<div className="grid gap-6 sm:grid-cols-2">
					{faq.map(({ question, answer }) => (
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

function ApplicationForm() {
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
				<p className="font-medium">Application received.</p>
				<p className="mt-1 text-muted-foreground text-sm">
					We’ll review your channel and reply by email.
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
				<label htmlFor="affiliate-website">Leave this field blank</label>
				<Input
					id="affiliate-website"
					name="website"
					tabIndex={-1}
					autoComplete="off"
				/>
			</div>
			<div className="grid gap-5 sm:grid-cols-2">
				<label htmlFor="affiliate-name" className="grid gap-2 text-sm">
					<span>Name</span>
					<Input
						id="affiliate-name"
						name="applicantName"
						autoComplete="name"
						maxLength={120}
						required
					/>
				</label>
				<label htmlFor="affiliate-email" className="grid gap-2 text-sm">
					<span>Email</span>
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
				<span>YouTube channel URL</span>
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
				<span>Relevant video or build URL</span>
				<Input
					id="affiliate-video"
					name="relevantVideoUrl"
					type="url"
					maxLength={2048}
					placeholder="https://youtube.com/watch?v=…"
					required
				/>
			</label>
			<label htmlFor="affiliate-setup" className="grid gap-2 text-sm">
				<span>Tell us about your audience and streaming setup</span>
				<Textarea
					id="affiliate-setup"
					name="audienceAndSetup"
					rows={5}
					maxLength={4000}
					placeholder="What do you build, test, and help viewers choose?"
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
				<span>
					I will clearly disclose the affiliate relationship in program content
					and follow YouTube’s paid-promotion rules.
				</span>
			</label>
			<div className="flex flex-wrap items-center gap-4">
				<Button type="submit" size="lg" disabled={application.isPending}>
					{application.isPending ? "Sending…" : "Send application"}
				</Button>
				<p className="text-muted-foreground text-xs">
					We use these details only to review and respond to your application.
					See our <Link to="/privacy">Privacy Policy</Link>.
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
