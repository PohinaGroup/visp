import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useState } from "react";

import { MeterMark } from "@/components/meter-mark";
import { SeppoWidget } from "@/components/seppo-widget";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import {
	COMPARISON_CHECKED,
	comparisonProducts,
	comparisonRows,
	comparisonRowsFi,
} from "@/lib/comparison";
import { type Locale, landingHead, localeSearch } from "@/lib/i18n";
import { type LandingLink, landingCopy } from "@/lib/landing-copy";

export const faq = landingCopy.en.faq.items;
export const faqFi = landingCopy.fi.faq.items;

export const Route = createFileRoute("/")({
	head: () =>
		landingHead(
			"en",
			landingCopy.en.meta.title,
			landingCopy.en.meta.description,
			faq,
		),
	component: () => <HomeComponent locale="en" />,
});

type Copy = (typeof landingCopy)[Locale];

const eyebrow =
	"font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground";
const h2 =
	"mt-5 max-w-2xl font-display font-semibold text-4xl uppercase leading-none tracking-tight sm:text-5xl";
const h3 =
	"font-display font-semibold text-2xl uppercase leading-tight tracking-tight";

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
			onClick={() => {
				trackEvent("lander_cta", { action: "try_free", locale });
				return session
					? navigate({ to: "/dashboard", search: localeSearch(locale) })
					: navigate({ to: "/login", search: localeSearch(locale) });
			}}
			className={`inline-flex items-center justify-center rounded-[var(--radius)] bg-primary font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
				lg ? "h-12 px-8 text-base" : "h-9 px-4 text-sm"
			}`}
		>
			{landingCopy[locale].tryCta}
		</button>
	);
}

function LinkList({
	links,
	locale,
	className,
	externalClassName = className,
}: {
	links: LandingLink[];
	locale: Locale;
	className: string;
	externalClassName?: string;
}) {
	return links.map((l) =>
		l.external ? (
			<a
				key={l.label}
				href={l.href}
				target="_blank"
				rel="noreferrer"
				className={externalClassName}
			>
				{l.label}
			</a>
		) : (
			<Link
				key={l.label}
				to={l.href}
				search={l.search}
				onClick={() =>
					l.href === "/download"
						? trackEvent("lander_cta", { action: "download", locale })
						: undefined
				}
				className={className}
			>
				{l.label}
			</Link>
		),
	);
}

// The lander's signature: the signal chain from the dashboard, drawn as two
// routes on one fixed grid so their nodes line up. Direct's third node is the
// OBS slot it skips, drawn dashed.
function SignalPath({ copy }: { copy: Copy["path"] }) {
	const routes = [
		{ ...copy.studio, direct: false },
		{ ...copy.direct, direct: true },
	];
	return (
		<section aria-label={copy.label} className="border-border border-y py-8">
			<ul className="flex flex-col gap-6">
				{routes.map((route) => (
					<li
						key={route.tag}
						className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:items-center"
					>
						<span className={eyebrow}>{route.tag}</span>
						<ol className="flex flex-wrap gap-2 sm:grid sm:grid-cols-[9rem_1fr_9rem_1fr_9rem_1fr_15rem] sm:items-center sm:gap-0">
							{route.nodes.map((node, i) => (
								<Fragment key={node}>
									{i > 0 && (
										<span
											aria-hidden
											className={`hidden border-t sm:block ${
												route.direct
													? "border-muted-foreground/40 border-dashed"
													: "border-foreground/60"
											}`}
										/>
									)}
									<li
										className={`flex items-center justify-center gap-2 border px-3 py-2 font-mono text-xs uppercase tracking-wider ${
											!route.direct
												? "border-foreground/60"
												: i === 2
													? "border-muted-foreground/40 border-dashed text-muted-foreground"
													: "border-border text-muted-foreground"
										}`}
									>
										{i === route.nodes.length - 1 && (
											<span
												aria-hidden
												className="size-1.5 rounded-full bg-tally"
											/>
										)}
										{node}
									</li>
								</Fragment>
							))}
						</ol>
					</li>
				))}
			</ul>
		</section>
	);
}

function AnnualCostChart({ copy }: { copy: Copy["cost"] }) {
	return (
		<figure className="mt-12 border border-border bg-card p-6 sm:p-8">
			<figcaption className="font-display font-semibold text-2xl uppercase tracking-tight">
				{copy.chartTitle}
			</figcaption>
			<p className="mt-2 text-muted-foreground text-sm">{copy.chartSubtitle}</p>
			<ul className="mt-8 flex flex-col gap-6">
				{copy.rows.map((row) => (
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
				{copy.chartNote}
			</p>
		</figure>
	);
}

function ComparisonTable({ locale }: { locale: Locale }) {
	const rows = locale === "fi" ? comparisonRowsFi : comparisonRows;
	return (
		// A real <table>: crawlers and answer engines parse it, a grid of divs
		// they do not.
		<div className="overflow-x-auto">
			<table className="w-full min-w-[860px] border-collapse border border-border text-left text-sm">
				<caption className="sr-only">
					{landingCopy[locale].cost.tableCaption}
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

function Workflow({
	flow,
	primary,
}: {
	flow: Copy["workflows"]["studio"];
	primary: boolean;
}) {
	return (
		<article
			className={`flex flex-col gap-8 p-8 ${primary ? "bg-card" : "bg-background"}`}
		>
			<div>
				<span className={eyebrow}>{flow.tag}</span>
				<h3 className={`mt-4 ${h3}`}>{flow.title}</h3>
			</div>
			<ol className="flex flex-col gap-5">
				{flow.steps.map((step, i) => (
					<li key={step.title} className="grid grid-cols-[2rem_1fr] gap-x-3">
						<span className="pt-0.5 font-mono text-muted-foreground text-xs">
							{String(i + 1).padStart(2, "0")}
						</span>
						<div>
							<p className="font-medium">{step.title}</p>
							<p className="mt-1 text-muted-foreground leading-relaxed">
								{step.body}
							</p>
						</div>
					</li>
				))}
			</ol>
			<img
				src={flow.image}
				alt={flow.imageAlt}
				width={258}
				height={560}
				loading="lazy"
				className="mt-auto w-full max-w-[180px] self-center border border-border"
			/>
		</article>
	);
}

export function HomeComponent({ locale }: { locale: Locale }) {
	const [seppoOpen, setSeppoOpen] = useState(false);
	const t = landingCopy[locale];
	const navLink =
		"text-muted-foreground transition-colors hover:text-foreground";

	return (
		<>
			<main className="min-h-screen bg-background text-foreground">
				<div className="mx-auto max-w-[1100px] px-6">
					{/* Top nav */}
					<header className="flex items-center justify-between border-border border-b py-5">
						<Link
							to={locale === "fi" ? "/fi" : "/"}
							className="flex items-center gap-3"
						>
							<span className="font-bold font-display text-xl uppercase leading-none tracking-[0.28em]">
								VISP
							</span>
							<MeterMark />
						</Link>
						<nav className="flex items-center gap-4 text-sm sm:gap-7">
							<LinkList
								links={t.nav}
								locale={locale}
								className={navLink}
								externalClassName={`${navLink} hidden sm:inline`}
							/>
							<a
								href={t.langSwitch.href}
								hrefLang={t.langSwitch.hrefLang}
								className={navLink}
							>
								{t.langSwitch.label}
							</a>
							<TryCta locale={locale} />
						</nav>
					</header>

					{/* Hero: the cost argument leads. */}
					<section className="lander-rise grid gap-10 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-24">
						<div className="flex flex-col gap-7">
							<span className={eyebrow}>{t.hero.eyebrow}</span>
							<h1 className="font-display font-semibold text-5xl uppercase leading-[0.92] tracking-tight sm:text-6xl md:text-[4.75rem]">
								{t.hero.title}
							</h1>
							<p className="max-w-xl text-lg text-muted-foreground leading-relaxed">
								{t.hero.body}
							</p>
							<div className="flex flex-wrap items-center gap-x-6 gap-y-4">
								<TryCta locale={locale} size="lg" />
								<Link
									to="/download"
									search={localeSearch(locale)}
									onClick={() =>
										trackEvent("lander_cta", { action: "download", locale })
									}
									className="text-sm underline underline-offset-4"
								>
									{t.downloadLink}
								</Link>
							</div>
							<p className="font-mono text-muted-foreground text-xs uppercase tracking-wider">
								{t.hero.note}
							</p>
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
									aria-label={t.hero.videoLabel}
									className="aspect-[9/16] w-full object-cover"
								>
									<source src="/marketing/go-live-loop.m4v" type="video/mp4" />
								</video>
								<figcaption className="absolute top-3 left-3 rounded-sm bg-background/85 px-2 py-1 font-mono text-[10px] text-foreground uppercase tracking-wider backdrop-blur-sm">
									{t.hero.videoCaption}
								</figcaption>
							</figure>
						</div>
					</section>

					<SignalPath copy={t.path} />

					{/* Cost: the proof behind the headline. */}
					<section id="compare" className="py-20">
						<span className={eyebrow}>{t.cost.eyebrow}</span>
						<h2 className={h2}>{t.cost.title}</h2>
						<p className="mt-6 max-w-2xl text-muted-foreground leading-relaxed">
							{t.cost.body}
						</p>
						<AnnualCostChart copy={t.cost} />
						<details className="mt-8 border border-border p-4">
							<summary className="cursor-pointer font-medium">
								{t.cost.tableToggle}
							</summary>
							<ComparisonTable locale={locale} />
						</details>
						<p className="mt-6 font-mono text-muted-foreground text-xs">
							{t.cost.checked} {COMPARISON_CHECKED}.
						</p>
					</section>

					{/* Workflows: studio first, Direct as the no-computer option. */}
					<section id="workflows" className="border-border border-t py-20">
						<span className={eyebrow}>{t.workflows.eyebrow}</span>
						<h2 className={h2}>{t.workflows.title}</h2>
						<div className="mt-12 grid gap-px border border-border bg-border md:grid-cols-2">
							<Workflow flow={t.workflows.studio} primary />
							<Workflow flow={t.workflows.direct} primary={false} />
						</div>
					</section>

					{/* Channels */}
					<section className="border-border border-t py-20">
						<h2 className={h2}>{t.channels.title}</h2>
						<ul className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2">
							{t.channels.items.map((c) => (
								<li key={c.tag} className="bg-background p-8">
									<span className={eyebrow}>{c.tag}</span>
									<h3 className={`mt-4 ${h3}`}>{c.title}</h3>
									<p className="mt-3 text-muted-foreground leading-relaxed">
										{c.body}
									</p>
								</li>
							))}
						</ul>
					</section>

					{/* FAQ: collapsed, but the answers stay in the DOM for crawlers. */}
					<section className="border-border border-t py-20">
						<span className={eyebrow}>{t.faq.eyebrow}</span>
						<h2 className={h2}>{t.faq.title}</h2>
						<div className="mt-12 border-border border-t">
							{t.faq.items.map((item) => (
								<details
									key={item.q}
									className="group border-border border-b py-5"
								>
									<summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 font-display font-semibold text-xl leading-snug tracking-tight [&::-webkit-details-marker]:hidden">
										{item.q}
										<span
											aria-hidden
											className="font-mono text-muted-foreground text-sm group-open:rotate-45"
										>
											+
										</span>
									</summary>
									<p className="mt-3 max-w-3xl text-muted-foreground leading-relaxed">
										{item.a}
									</p>
								</details>
							))}
						</div>
					</section>

					{/* Closing CTA */}
					<section className="border-border border-t py-24 text-center">
						<span className={eyebrow}>{t.closing.eyebrow}</span>
						<h2 className="mt-5 font-display font-semibold text-6xl uppercase leading-none tracking-tight sm:text-7xl">
							{t.closing.title}
						</h2>
						<div className="mt-8 flex flex-col items-center gap-3">
							<TryCta locale={locale} size="lg" />
							<p className="max-w-md text-muted-foreground text-sm leading-relaxed">
								{t.closing.body}
								<Link
									to="/download"
									search={localeSearch(locale)}
									onClick={() =>
										trackEvent("lander_cta", { action: "download", locale })
									}
									className="text-foreground underline underline-offset-4"
								>
									{t.closing.link}
								</Link>
								.
							</p>
						</div>
					</section>

					{/* Footer */}
					<footer className="flex flex-col gap-4 border-border border-t py-10">
						<nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
							<LinkList links={t.footer} locale={locale} className={navLink} />
						</nav>
						<p className="font-mono text-muted-foreground text-xs">
							© 2026 VISP · Pöhinä Group Oy
						</p>
					</footer>
				</div>
			</main>
			<SeppoWidget
				context="landing"
				open={seppoOpen}
				placeholder={t.seppo.placeholder}
				subtitle={t.seppo.subtitle}
				suggestions={t.seppo.suggestions}
				welcome={t.seppo.welcome}
				onOpenChange={setSeppoOpen}
			/>
		</>
	);
}
