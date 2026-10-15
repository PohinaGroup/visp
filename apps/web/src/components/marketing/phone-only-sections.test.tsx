import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { PhoneOnlySections } from "./phone-only-sections";

// renderToStaticMarkup escapes text, so compare against escaped copy.
const esc = (s: string) => renderToStaticMarkup(s);

// The OBS link is a router Link; a bare router is enough to build its href.
const router = createRouter({
	routeTree: createRootRoute(),
	history: createMemoryHistory(),
});

for (const locale of ["en", "fi"] as Locale[]) {
	const page = landingCopy[locale].phoneOnly;
	const html = renderToStaticMarkup(
		<RouterContextProvider router={router}>
			<PhoneOnlySections locale={locale} />
		</RouterContextProvider>,
	);
	const fi = locale === "fi" ? "/fi" : "";

	test(`${locale}: the never-drop situations follow the compact strip`, () => {
		const strip = html.indexOf(esc(page.strip.beats[0]));
		expect(strip).toBeGreaterThan(html.indexOf(esc(page.situationsTitle)));
		for (const s of page.situations) {
			expect(html.indexOf(`>${esc(s.heading)}</h3>`)).toBeGreaterThan(strip);
			expect(html).toContain(esc(s.body));
			expect(html).toContain(esc(s.feature));
		}
		// Compact: the strip's own heading stays off this page.
		expect(html).not.toContain(`>${esc(page.strip.label)}</h2>`);
	});

	test(`${locale}: Cloud Studio carries a visible beta badge`, () => {
		const { studio } = page;
		const block = html.slice(
			html.indexOf(esc(studio.heading)) - 400,
			html.indexOf(esc(studio.body)),
		);
		expect(block).toContain(`>${esc(studio.beta)}</span>`);
		expect(html).toContain(esc(studio.feature));
		for (const s of page.more.items) expect(html).toContain(esc(s.heading));
	});

	test(`${locale}: the versus table has every row with both cells`, () => {
		const title = html.indexOf(`>${esc(page.versus.title)}</h2>`);
		expect(title).toBeGreaterThan(-1);
		expect(html.indexOf("<table", title)).toBeGreaterThan(title);
		for (const column of page.versus.columns)
			expect(html).toContain(`data-label="${esc(column)}"`);
		for (const row of page.versus.rows) {
			const start = html.indexOf(`>${esc(row.label)}</th>`);
			expect(start).toBeGreaterThan(-1);
			const tr = html.slice(start, html.indexOf("</tr>", start));
			expect(tr).toContain(esc(row.phone));
			expect(tr).toContain(esc(row.obs));
		}
	});

	test(`${locale}: cost, steps, and the OBS link`, () => {
		expect(html).toContain(esc(page.cost.heading));
		expect(html).toContain(`href="${fi}/affiliate"`);
		for (const step of page.steps.items)
			expect(html).toContain(esc(step.title));
		const steps = html.lastIndexOf(esc(page.steps.items[2].title));
		const obs = html.indexOf(`href="${fi}/with-obs"`);
		expect(obs).toBeGreaterThan(steps);
		expect(html).toContain(esc(page.obsNote.link));
	});

	test(`${locale}: every FAQ answer ships in the HTML`, () => {
		for (const item of page.faq.items) {
			expect(html).toContain(esc(item.q));
			expect(html).toContain(esc(item.a));
		}
	});
}
