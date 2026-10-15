import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { comparisonRows, comparisonRowsFi } from "@/lib/comparison";
import { docs } from "@/lib/docs";
import type { Locale } from "@/lib/i18n";
import { landingCopy } from "@/lib/landing-copy";
import { legalEntity } from "@/lib/legal";
import type { ObsPluginRelease } from "@/lib/obs-releases";
import { WithObsNote, WithObsSections } from "./with-obs-sections";

// renderToStaticMarkup escapes text, so compare against escaped copy.
const esc = (s: string) => renderToStaticMarkup(s);

// The no-PC note is a router Link; a bare router is enough to build its href.
const router = createRouter({
	routeTree: createRootRoute(),
	history: createMemoryHistory(),
});

const release: ObsPluginRelease = {
	tagName: "v1.2.0",
	htmlUrl: "https://github.com/example/visp/releases/tag/v1.2.0",
	assets: [
		{
			platform: "windows",
			label: "Windows",
			fileName: "visp-obs-1.2.0-windows-x64.exe",
			downloadUrl: "https://example.com/visp-obs-1.2.0-windows-x64.exe",
		},
	],
};

const render = (locale: Locale, r: ObsPluginRelease | null) =>
	renderToStaticMarkup(<WithObsSections locale={locale} release={r} />);

for (const locale of ["en", "fi"] as Locale[]) {
	const page = landingCopy[locale].withObs;
	const html = render(locale, release);
	const fi = locale === "fi" ? "/fi" : "";

	test(`${locale}: the no-PC note links to phone only`, () => {
		const note = renderToStaticMarkup(
			<RouterContextProvider router={router}>
				<WithObsNote locale={locale} />
			</RouterContextProvider>,
		);
		expect(note).toContain(esc(page.noPcNote.text));
		expect(note).toMatch(
			new RegExp(`href="${fi}/phone-only"[^>]*>${esc(page.noPcNote.link)}<`),
		);
	});

	test(`${locale}: the plugin block lists every step in order and links its docs`, () => {
		const { plugin } = page;
		expect(html).toContain(`>${esc(plugin.title)}</h2>`);
		expect(html).toContain(esc(plugin.body));
		const list = html.slice(html.indexOf("<ol"), html.indexOf("</ol>"));
		let last = -1;
		for (const step of plugin.steps) {
			const at = list.indexOf(`>${esc(step)}</li>`);
			expect(at).toBeGreaterThan(last);
			last = at;
		}
		expect(html).toMatch(
			new RegExp(`href="${docs.obsRemoteControl}"[^>]*>${esc(plugin.docs)}<`),
		);
	});

	test(`${locale}: the download button falls back to the release page`, () => {
		// The platform asset is picked after mount; the server HTML links the
		// release, or the releases list when GitHub gave nothing.
		const download = (h: string) =>
			h.match(
				new RegExp(`<a href="([^"]+)"[^>]*>${esc(page.plugin.download)}<`),
			)?.[1];
		expect(download(html)).toBe(release.htmlUrl);
		expect(download(render(locale, null))).toBe(legalEntity.releasesUrl);
	});

	test(`${locale}: situations and the studio list`, () => {
		expect(html).toContain(esc(page.situationsTitle));
		expect(page.situations).toHaveLength(4);
		for (const s of page.situations) {
			expect(html).toContain(`>${esc(s.heading)}</h3>`);
			expect(html).toContain(esc(s.body));
			expect(html).toContain(esc(s.feature));
		}
		expect(html).toContain(`>${esc(page.studio.title)}</h2>`);
		for (const item of page.studio.items)
			expect(html).toContain(`>${esc(item)}</li>`);
	});

	test(`${locale}: the compare section has the cost chart and every competitor row`, () => {
		const start = html.indexOf('id="compare"');
		expect(start).toBeGreaterThan(-1);
		const compare = html.slice(start);
		expect(compare).toContain(esc(page.cost.heading));
		expect(compare).toContain(esc(page.cost.chartTitle));
		expect(compare).toContain(`href="${fi}/affiliate"`);
		expect(compare).toContain(`${esc(page.cost.tableCaption)}</caption>`);
		const rows = locale === "fi" ? comparisonRowsFi : comparisonRows;
		for (const row of rows) {
			expect(compare).toContain(`>${esc(row.label)}</th>`);
			for (const cell of row.cells) expect(compare).toContain(esc(cell));
		}
		expect(compare).toContain(esc(page.cost.checked));
	});

	test(`${locale}: steps and every FAQ answer ship in the HTML`, () => {
		for (const step of page.steps.items)
			expect(html).toContain(esc(step.title));
		for (const item of page.faq.items) {
			expect(html).toContain(esc(item.q));
			expect(html).toContain(esc(item.a));
		}
	});

	test(`${locale}: sections follow the spec order`, () => {
		const order = [
			page.plugin.title,
			page.situationsTitle,
			page.studio.title,
			page.cost.heading,
			page.steps.title,
			page.faq.title,
		].map((s) => html.indexOf(`>${esc(s)}</h2>`));
		expect(order.every((at) => at > -1)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
	});
}
