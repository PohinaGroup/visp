import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { landingCopy } from "@/lib/landing-copy";

import { ThemeToggleView } from "./theme-toggle";

// sticky-cta imports TryCta, whose auth client validates VITE_SERVER_URL at
// import time. A default URL (no module mock, so nothing leaks to other files).
process.env.VITE_SERVER_URL ??= "http://localhost:3000";
const { StickyCtaBar, stickyVisible } = await import("./sticky-cta");

const labels = landingCopy.en.shared.nav.theme;

test("sticky CTA sits under the cookie banner and clears the home indicator", () => {
	const html = renderToStaticMarkup(
		<StickyCtaBar visible>
			<button type="button">Start free</button>
		</StickyCtaBar>,
	);
	expect(html).toContain("z-40");
	expect(html).toContain("env(safe-area-inset-bottom)");
	expect(html).toContain("h-12");
	expect(html).toContain("md:hidden");
	expect(html).toContain("Start free");
});

test("hidden sticky CTA is out of the tab order", () => {
	const html = renderToStaticMarkup(
		<StickyCtaBar visible={false}>
			<button type="button">Start free</button>
		</StickyCtaBar>,
	);
	expect(html).toContain("inert");
	expect(html).toContain('aria-hidden="true"');
});

test("sticky CTA shows only between the hero CTA and the closing CTA", () => {
	const vh = 800;
	// Hero CTA still on screen.
	expect(stickyVisible({ bottom: 120 }, { top: 3000 }, vh)).toBe(false);
	// Scrolled past the hero CTA, closing CTA below the fold.
	expect(stickyVisible({ bottom: -10 }, { top: 2000 }, vh)).toBe(true);
	// Closing CTA has come into view.
	expect(stickyVisible({ bottom: -2000 }, { top: 600 }, vh)).toBe(false);
	// Page without a closing CTA.
	expect(stickyVisible({ bottom: -10 }, null, vh)).toBe(true);
	// Page without the hero sentinel never shows it.
	expect(stickyVisible(null, null, vh)).toBe(false);
});

test("theme toggle exposes pressed state", () => {
	const html = renderToStaticMarkup(
		<ThemeToggleView value="dark" labels={labels} onChange={() => {}} />,
	);
	expect(html).toMatch(
		/aria-pressed="true"[^>]*>[^<]*Dark|Dark[\s\S]*aria-pressed="true"/,
	);
	expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
	expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
	expect(html).toMatch(/aria-pressed="true"[^>]*>Dark</);
});

test("sheet theme segments are 48px tall and 8px apart", () => {
	const html = renderToStaticMarkup(
		<ThemeToggleView value="dark" labels={labels} onChange={() => {}} />,
	);
	expect(html).toMatch(/<fieldset[^>]*class="[^"]*\bgap-2\b/);
	expect(html.match(/<button[^>]*class="h-12 /g)).toHaveLength(3);
});

test("theme toggle has no pressed state before the preference is read", () => {
	const html = renderToStaticMarkup(
		<ThemeToggleView value={null} labels={labels} onChange={() => {}} />,
	);
	expect(html).not.toContain('aria-pressed="true"');
	expect(html.match(/aria-pressed="false"/g)).toHaveLength(3);
});

test("icon theme toggle keeps an accessible name per option", () => {
	const html = renderToStaticMarkup(
		<ThemeToggleView
			value="system"
			labels={labels}
			onChange={() => {}}
			variant="icons"
		/>,
	);
	for (const label of [labels.light, labels.dark, labels.system])
		expect(html).toContain(`aria-label="${label}"`);
	expect(html).toContain(`aria-label="${labels.label}"`);
	expect(html.match(/<svg/g)).toHaveLength(3);
	expect(html).toMatch(/<fieldset[^>]*class="[^"]*\bgap-2\b/);
});
