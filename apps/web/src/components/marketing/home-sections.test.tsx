import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { HomeSections } from "./home-sections";

// renderToStaticMarkup escapes text, so compare against escaped copy.
const esc = (s: string) => renderToStaticMarkup(s);

/** The `<a href={href}>…</a>` element that contains `text`. */
function anchor(html: string, href: string, text: string) {
	const tiles = html.split("</a>").map((chunk) => {
		const start = chunk.lastIndexOf(`<a href="${href}"`);
		return start === -1 ? "" : chunk.slice(start);
	});
	return tiles.find((tile) => tile.includes(esc(text))) ?? "";
}

for (const locale of ["en", "fi"] as Locale[]) {
	const home = landingCopy[locale].home;
	const html = renderToStaticMarkup(<HomeSections locale={locale} />);
	const fi = locale === "fi" ? "/fi" : "";

	test(`${locale}: the signal strip and its note are on the page`, () => {
		for (const s of [home.strip.label, ...home.strip.beats, home.stripNote])
			expect(html).toContain(esc(s));
	});

	test(`${locale}: every phone-only item is listed with its feature and mark`, () => {
		expect(html).toContain(esc(home.noObs.title));
		for (const item of home.noObs.items) {
			expect(html).toContain(esc(item.situation));
			expect(html).toContain(esc(item.feature));
		}
		// One "phone only" mark per item (the FAQ may say it too, so count only
		// between this section's heading and the chooser).
		const section = html.slice(
			html.indexOf(esc(home.noObs.title)),
			html.indexOf(esc(home.chooser.title)),
		);
		expect(section.split(esc(home.noObs.mark)).length - 1).toBe(
			home.noObs.items.length,
		);
		for (const line of home.more) expect(html).toContain(esc(line));
		expect(html).toContain(`href="${fi}/phone-only"`);
	});

	test(`${locale}: the chooser leads with the filled phone tile`, () => {
		const { chooser } = home;
		expect(html).toContain(esc(chooser.title));
		const phone = html.indexOf(esc(chooser.phone.title));
		const obs = html.indexOf(esc(chooser.obs.title));
		expect(phone).toBeGreaterThan(-1);
		expect(obs).toBeGreaterThan(phone);
		expect(html).toContain(esc(chooser.phone.badge ?? ""));
		// Each whole tile is the link: title, body, and badge sit inside it.
		const phoneTile = anchor(html, `${fi}/phone-only`, chooser.phone.title);
		expect(phoneTile).toMatch(
			/^<a [^>]*class="[^"]*\bbg-ink\b[^"]*\btext-paper\b/,
		);
		for (const s of [chooser.phone.body, chooser.phone.badge ?? ""])
			expect(phoneTile).toContain(esc(s));
		const obsTile = anchor(html, `${fi}/with-obs`, chooser.obs.title);
		expect(obsTile).toContain(esc(chooser.obs.body));
		expect(obsTile).not.toMatch(/^<a [^>]*class="[^"]*\bbg-ink\b/);
	});

	test(`${locale}: every FAQ answer ships in the HTML`, () => {
		for (const item of home.faq.items) {
			expect(html).toContain(esc(item.q));
			expect(html).toContain(esc(item.a));
		}
	});

	test(`${locale}: no stories section while the list is empty`, () => {
		expect(html).not.toContain(esc(home.storiesTitle));
	});
}
