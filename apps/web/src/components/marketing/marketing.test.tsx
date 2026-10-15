import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { landingCopy } from "@/lib/landing-copy";

import { ComparisonTable } from "./comparison-table";
import { CostChart } from "./cost-chart";
import { Faq } from "./faq";
import { HeroVideo } from "./hero-video";
import { SignalStrip } from "./signal-strip";
import { SituationList } from "./situation-list";
import { StepList } from "./step-list";
import { Stories } from "./stories";

const en = landingCopy.en;
// renderToStaticMarkup escapes text, so compare against escaped copy.
const esc = (s: string) => renderToStaticMarkup(s);

test("signal strip SSR carries every caption and both tracks", () => {
	const strip = en.home.strip;
	const html = renderToStaticMarkup(<SignalStrip copy={strip} />);
	for (const s of [
		...strip.beats,
		...strip.details,
		strip.signalTrack,
		strip.viewerTrack,
		strip.live,
		strip.brb,
	])
		expect(html).toContain(esc(s));
	expect(html).toContain("strip-play");
	// Two orientations, each with one unbroken on-air path.
	expect(html.match(/<svg[^>]*role="img"/g)).toHaveLength(2);
	expect(html.match(/data-on-air/g)).toHaveLength(2);
	expect(html).toMatch(/<svg[^>]*pointer-events-none/);
	expect(html.match(/<ol/g)).toHaveLength(1);
});

test("compact strip drops the section heading but keeps the beats", () => {
	const strip = en.home.strip;
	const html = renderToStaticMarkup(<SignalStrip copy={strip} compact />);
	expect(html).not.toContain("<h2");
	for (const s of strip.beats) expect(html).toContain(esc(s));
	expect(renderToStaticMarkup(<SignalStrip copy={strip} />)).toContain("<h2");
});

test("faq answers are in the HTML while collapsed", () => {
	const html = renderToStaticMarkup(<Faq copy={en.phoneOnly.faq} />);
	for (const i of en.phoneOnly.faq.items) {
		expect(html).toContain(esc(i.q));
		expect(html).toContain(esc(i.a));
	}
	expect(html).not.toMatch(/<details[^>]*\bopen\b/);
});

test("stories render nothing when empty", () => {
	expect(renderToStaticMarkup(<Stories stories={[]} title="x" />)).toBe("");
});

test("stories link the creator's channel", () => {
	const html = renderToStaticMarkup(
		<Stories
			title="Creators"
			stories={[
				{
					name: "Ada",
					channelUrl: "https://twitch.tv/ada",
					streams: "IRL",
					quote: "Never dropped.",
				},
			]}
		/>,
	);
	expect(html).toContain("<blockquote");
	expect(html).toContain('href="https://twitch.tv/ada"');
	expect(html).toContain('rel="noreferrer"');
});

test("comparison cells carry data-label for mobile stacking", () => {
	const html = renderToStaticMarkup(
		<ComparisonTable
			caption="c"
			columns={["A", "B"]}
			rows={[{ label: "r", cells: ["1", "2"] }]}
		/>,
	);
	expect(html).toContain("<table");
	expect(html).toContain('data-label="A"');
	expect(html).toContain('data-label="B"');
	// A two-column table never scrolls sideways, so no focusable wrapper.
	expect(html).not.toContain("tabindex");
});

test("a wide comparison table gets a focusable, labelled scroll region", () => {
	const html = renderToStaticMarkup(
		<ComparisonTable
			caption="Wide"
			columns={["A", "B", "C"]}
			rows={[{ label: "r", cells: ["1", "2", "3"] }]}
		/>,
	);
	// A <section> with an accessible name is a region landmark.
	expect(html).toMatch(/<section[^>]*aria-label="Wide"/);
	expect(html).toContain('tabindex="0"');
});

test("hero video ships poster, no autoplay attribute, and a play button in SSR", () => {
	const html = renderToStaticMarkup(
		<HeroVideo
			src="/v.m4v"
			poster="/p.jpg"
			label="l"
			buttons={{ pause: "Pause", play: "Play" }}
		/>,
	);
	expect(html).toContain('poster="/p.jpg"');
	expect(html).not.toContain("autoplay");
	expect(html).not.toMatch(/<video[^>]*\scontrols/);
	expect(html).toMatch(/<button[^>]*>.*Play<\/button>/);
	expect(html).toContain('preload="none"');
	expect(html).toMatch(/width="\d+"/);
	expect(html).toMatch(/height="\d+"/);
});

test("situations render heading, body, and feature", () => {
	const s = en.phoneOnly.situations[0];
	const html = renderToStaticMarkup(<SituationList items={[s]} />);
	for (const t of [s.heading, s.body, s.feature])
		expect(html).toContain(esc(t));
});

test("steps are a numbered sequence", () => {
	const steps = en.phoneOnly.steps;
	const html = renderToStaticMarkup(
		<StepList title={steps.title} items={steps.items} />,
	);
	expect(html).toContain("<ol");
	expect(html).toContain(esc(steps.title));
	for (const s of steps.items) {
		expect(html).toContain(esc(s.title));
		expect(html).toContain(esc(s.body));
	}
	expect(html).toMatch(/>1<[\s\S]*>2<[\s\S]*>3</);
});

test("cost chart shows every product and price with the affiliate link", () => {
	const cost = en.phoneOnly.cost;
	const html = renderToStaticMarkup(
		<CostChart copy={cost} affiliateHref="/affiliate" />,
	);
	for (const r of cost.rows) {
		expect(html).toContain(esc(r.product));
		expect(html).toContain(esc(r.cost));
	}
	for (const s of [cost.chartTitle, cost.chartSubtitle, cost.affiliateNote])
		expect(html).toContain(esc(s));
	expect(html).toContain('href="/affiliate"');
});
