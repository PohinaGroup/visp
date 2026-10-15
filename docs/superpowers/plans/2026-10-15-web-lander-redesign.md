# Web Lander Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single "Stop paying for cloud OBS" lander with three pages — home, `/phone-only`, `/with-obs` (plus `/fi/*` twins) — that explain VISP through real streaming situations, lead with Direct, work beautifully on phones, support light and dark, and stay SEO-complete.

**Architecture:** Copy lives in one typed module per locale (`lib/landing-copy.ts`, `fi: typeof en`). Presentational marketing pieces live in `components/marketing/` and take copy as props, with no router dependency, so they render under `renderToStaticMarkup` in `bun test` (which doubles as the SSR/SEO check). Route files compose them and own CTAs (`Link`). Public pages follow a light/dark preference set by an inline pre-paint script; app routes stay forced dark.

**Tech Stack:** TanStack Start (SSR) + TanStack Router file routes, React 19, Tailwind v4 (`apps/web/src/index.css`), astryx `Theme`, `bun test`, `@fontsource-variable/archivo@5.3.0` (new, `wdth.css` build).

**Spec:** `docs/superpowers/specs/2026-10-15-web-lander-redesign-design.md`

## Global Constraints

- Logo unchanged: `VISP` wordmark + `<MeterMark />` from `components/meter-mark.tsx`.
- Every page exists in en and fi; `fi` copy typed as `typeof en`.
- Never frame the choice as "Do you use OBS?"; the chooser H2 is "Where do you want to make your show?" and the phone-only tile comes first.
- Every feature is introduced by its situation (heading) → what VISP does → feature name (small print). Use the spec's situation tables verbatim as the English source.
- Cloud Studio is labelled "beta" wherever it appears, in both locales.
- No invented testimonials: `stories` arrays ship empty; the Stories section renders nothing when empty.
- Banned template tells: mono uppercase eyebrows over headings, 01/02/03 markers except on the two real "How it works" sequences, middle-dot lists (`A · B · C`), arrows (`→`) in button or link text.
- Palette (CSS vars on `.mkt`, dark under `html.dark .mkt`): `--paper #E9EDF0/#0E1A28`, `--surface #FFFFFF/#152536`, `--ink #12263B/#E9EDF0`, `--ink-muted #4B5D70/#9FB0C0`, `--on-air #E5352B/#F0483D`, `--signal #2E9B5C/#3FBF74`, `--weak #E9A23B/#F0B44C`. Text pairs ≥ 4.5:1.
- Type: `"Archivo Variable"`; headlines `font-stretch: 118%`, weight 800, sentence case; body 100%, 400, ≥ 17px, ≤ 70ch. IBM Plex Mono only for URLs/codes.
- Max width 1200px; 16px side gutter on phones; no horizontal page scroll down to 360px.
- Tap targets ≥ 44×44px, ≥ 8px apart; FAQ summary rows ≥ 56px tall.
- Only the signal strip animates on load, once; under `prefers-reduced-motion: reduce` it is a still frame.
- Public pages (home, route pages, blog, download, legal, affiliate, contact, cookies) follow the theme; `_auth/*`, `/studio`, `/overlay`, `/device`, `/login`, `/auth/*` stay forced dark.

## Review Focus

1. Long Finnish words in H1s/tiles at 360px wide (e.g. "Yhteyskatkoksista") must wrap, never overflow — Task 2 adds `overflow-wrap:anywhere; hyphens:auto` on `.mkt h1,h2,h3` and Task 10 screenshots fi at 360px.
2. A crawler or no-JS visitor must get every word: all copy, FAQ answers, the comparison table, and the signal-strip captions present in SSR HTML — Task 5 asserts on `renderToStaticMarkup` output; Task 10 runs `curl` against each route.
3. Theme on reload: a stored `dark` preference must not flash light, and an app route must be dark even when the stored preference is `light` — Task 1 tests `themeInitScript` against both cases.
4. The sticky "Start free" bar must never sit under the cookie banner, Seppo bubble, or the iOS home indicator — Task 6 pins z-order/offsets with a test on the class contract; Task 10 screenshots 375×667 with the cookie banner open.
5. A signed-in visitor clicking any "Start free" lands on `/dashboard`, not `/login` — `TryCta` already does this; Task 7 reuses `TryCta` for every CTA including the sticky bar (no new CTA buttons).

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/lib/theme.ts` (new) | `THEME_KEY`, `isForcedDarkPath`, `themeInitScript`, `useThemePreference` |
| `src/routes/__root.tsx` | pre-paint script, html class per path, astryx `Theme mode` from preference |
| `src/index.css` | Archivo import, `.mkt` tokens + base type, signal-strip keyframes, mobile table stacking |
| `src/lib/landing-copy.ts` | restructured: `{ shared, home, phoneOnly, withObs, stories }` per locale |
| `src/lib/i18n.ts` | `landingHead(locale, path, title, description, extras)`, `FI_TWIN` adds two paths |
| `src/lib/seo.ts` (new) | `faqJsonLd`, `howToJsonLd`, `softwareAppJsonLd` |
| `src/lib/comparison.ts` | bonding row fixed |
| `src/routes/sitemap[.]xml.ts`, `src/routes/llms[.]txt.ts` | new pages, fixed bonding claim |
| `src/components/marketing/*.tsx` (new) | `SignalStrip`, `SituationList`, `StepList`, `Faq`, `Stories`, `ComparisonTable`, `CostChart`, `StickyCta`, `MarketingFooter`, `ThemeToggle`, `MobileMenu` |
| `src/components/header.tsx` | new nav, menu sheet on phones, theme toggle |
| `src/routes/index.tsx`, `src/routes/fi/index.tsx` | home |
| `src/routes/phone-only.tsx`, `src/routes/fi/phone-only.tsx` (new) | phone-only page |
| `src/routes/with-obs.tsx`, `src/routes/fi/with-obs.tsx` (new) | with-OBS page |

Route tree: `routeTree.gen.ts` regenerates while `bun run dev` runs in `apps/web` (no CLI works here). Keep the dev server running during Tasks 7–9.

---

### Task 1: Theme preference and pre-paint script

**Files:**
- Create: `src/lib/theme.ts`, `src/lib/theme.test.ts`
- Modify: `src/routes/__root.tsx` (`RootDocument`)

**Interfaces:**
- Produces:
  - `THEME_KEY = "visp-theme"`
  - `type ThemePreference = "light" | "dark" | "system"`
  - `isForcedDarkPath(pathname: string): boolean` — true for `/dashboard`, `/setup`, `/studio`, `/overlay`, `/device`, `/login`, paths starting `/auth`, and `?`-free fi variants of those if any.
  - `themeInitScript: string` — IIFE; reads `localStorage[THEME_KEY]` (try/catch), falls back to `matchMedia("(prefers-color-scheme: dark)")`; if `isForcedDarkPath(location.pathname)` forces dark; toggles `dark` on `document.documentElement` and sets `data-theme`.
  - `useThemePreference(): { preference: ThemePreference; resolved: "light" | "dark"; setPreference(p: ThemePreference): void }` — writes storage (try/catch), updates the html class, listens to `matchMedia` change when `system`.

- [ ] **Step 1: Write failing tests** in `src/lib/theme.test.ts`:

```ts
test("forced-dark paths", () => {
  for (const p of ["/dashboard", "/setup", "/studio", "/overlay", "/device", "/login", "/auth/agent-approval"])
    expect(isForcedDarkPath(p)).toBe(true);
  for (const p of ["/", "/fi", "/phone-only", "/fi/with-obs", "/blog/x", "/download"])
    expect(isForcedDarkPath(p)).toBe(false);
});
test("init script: stored dark wins on a public page", () => {
  expect(runInit({ stored: "dark", prefersDark: false, path: "/" })).toBe(true);
});
test("init script: app route is dark even when stored light", () => {
  expect(runInit({ stored: "light", prefersDark: false, path: "/dashboard" })).toBe(true);
});
test("init script: system follows media query; storage throwing falls back", () => {
  expect(runInit({ stored: null, prefersDark: true, path: "/" })).toBe(true);
  expect(runInit({ stored: "throw", prefersDark: false, path: "/" })).toBe(false);
});
```

`runInit` is a test helper that evaluates `themeInitScript` with `new Function("localStorage","matchMedia","location","document", script)` against stub objects and returns whether `classList` contains `dark`.

- [ ] **Step 2:** Run `bun test src/lib/theme.test.ts` — FAIL (module missing).
- [ ] **Step 3:** Implement `src/lib/theme.ts`. `themeInitScript` must not import anything (it is stringified); build it from `isForcedDarkPath.toString()` so the path list has one source.
- [ ] **Step 4:** Run the test — PASS.
- [ ] **Step 5:** Wire `__root.tsx`: `<html lang suppressHydrationWarning className={forcedDark ? "dark" : undefined}>`; in `<head>`, `<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />` before `<HeadContent />`; `<Theme mode={forcedDark ? "dark" : resolved}>` from `useThemePreference()`. The landing check (`isLanding`) extends to `/phone-only`, `/with-obs`, `/fi/phone-only`, `/fi/with-obs` so those pages also bring their own chrome.
- [ ] **Step 6:** `bun run check-types` in `apps/web` — clean. Load `/dashboard` and `/` in the browser with `localStorage["visp-theme"]="light"`: dashboard dark, home light.
- [ ] **Step 7:** Commit `feat(web): light/dark preference for public pages`.

### Task 2: Marketing tokens, Archivo, base type

**Files:**
- Modify: `apps/web/package.json` (add `@fontsource-variable/archivo@5.3.0`), `src/index.css`
- Create: `src/lib/marketing-palette.ts`, `src/lib/marketing-palette.test.ts`

**Interfaces:**
- Produces: CSS class `.mkt` (page wrapper) exposing `--paper --surface --ink --ink-muted --on-air --signal --weak`; Tailwind theme colors `paper surface ink ink-muted on-air signal weak` (via `@theme inline` mapping to the vars) and `--font-marketing: "Archivo Variable"`; utility class `.mkt-display` (stretch 118%, weight 800, leading 0.98, tracking -0.02em).
- `MARKETING_PALETTE: Record<"light" | "dark", Record<TokenName, string>>` with the hexes from Global Constraints; `contrastRatio(a: string, b: string): number` (WCAG relative luminance).

- [ ] **Step 1: Failing test** `marketing-palette.test.ts`:

```ts
for (const mode of ["light", "dark"] as const) {
  const p = MARKETING_PALETTE[mode];
  test(`${mode}: text pairs meet AA`, () => {
    for (const bg of [p.paper, p.surface]) {
      expect(contrastRatio(p.ink, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.inkMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
  test(`${mode}: index.css carries the same hexes`, () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    for (const hex of Object.values(p)) expect(css.toLowerCase()).toContain(hex.toLowerCase());
  });
}
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the palette module; add to `index.css`: `@import "@fontsource-variable/archivo/wdth.css";`, `.mkt` and `html.dark .mkt` var blocks, `.mkt { background: var(--paper); color: var(--ink); font-family: var(--font-marketing); font-size: 1.0625rem; }`, `.mkt :is(h1,h2,h3) { overflow-wrap: anywhere; hyphens: auto; text-wrap: balance; }`, `.mkt :focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }`. If `inkMuted` fails AA on a background, darken/lighten it until it passes and update the spec table in the same commit.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(web): marketing palette and Archivo`.

### Task 3: Copy restructure with situations

**Files:**
- Modify: `src/lib/landing-copy.ts`
- Create: `src/lib/landing-copy.test.ts`

**Interfaces:**
- Produces, per locale (`landingCopy.en`, `landingCopy.fi`):
  - `shared: { tryCta, downloadLink, nav: { phoneOnly, withObs, download, docs, blog, menu, close, theme: { light, dark, system } }, footer: LandingLink[], stickyCta, seppo }`
  - `home: { meta: {title, description}, hero: {title, body, videoLabel}, strip: StripCopy, stripNote, noObs: { title, items: { situation: string; feature: string }[], link }, more: string[], chooser: { title, phone: Tile, obs: Tile }, faq: Faq }`
  - `phoneOnly: { meta, hero: {title, body, imageAlt}, why: {title, body}, strip: StripCopy, situations: Situation[], studio: Situation & { beta: string }, versus: VersusTable, cost: CostCopy, steps: {title, items: Step[]}, faq: Faq, closing: {title, body} }`
  - `withObs: { meta, noPcNote: {text, link}, hero: {title, body, videoLabel}, plugin: {title, body, steps: string[], download, docs}, situations: Situation[], studio: {title, items: string[]}, cost: CostCopy, steps: {...}, faq: Faq, closing }`
  - `stories: Story[]` (empty)
- Types (exported): `Situation = { heading: string; body: string; feature: string }`, `StripCopy = { label: string; signalTrack: string; viewerTrack: string; beats: [string, string, string]; live: string; brb: string }`, `Tile = { title: string; body: string; badge?: string }`, `Faq = { title: string; items: { q: string; a: string }[] }`, `Story = { name: string; channelUrl: string; streams: string; quote: string; photo?: string }`, `VersusTable = { caption: string; columns: [string, string]; rows: { label: string; phone: string; obs: string }[] }`, `CostCopy` = today's `cost` shape with a second `$0` row "VISP phone only".
- English copy: situations verbatim from the spec tables; strip beats "Signal weakens on the highway" / "Dead zone: viewers watch your clips" / "Back in range: live again". FAQ "Can I use Wi-Fi and cellular at the same time?" rewritten: the app can combine both or send every packet over both (Network bonding). phoneOnly FAQ includes "Do I need OBS for a BRB screen or overlays?" — "No. …".

- [ ] **Step 1: Failing tests** in `landing-copy.test.ts`:

```ts
const all = (o: unknown): string[] => typeof o === "string" ? [o] : Array.isArray(o) ? o.flatMap(all) : o && typeof o === "object" ? Object.values(o).flatMap(all) : [];
for (const locale of ["en", "fi"] as const) {
  const text = all(landingCopy[locale]);
  test(`${locale}: no template tells`, () => {
    for (const s of text) { expect(s).not.toContain("→"); expect(s).not.toMatch(/\S · \S/); }
  });
  test(`${locale}: Cloud Studio always says beta`, () => {
    expect(landingCopy[locale].phoneOnly.studio.beta.toLowerCase()).toContain("beta");
    expect(text.filter((s) => s.includes("Cloud Studio")).every((s) => /beta/i.test(s))).toBe(true);
  });
  test(`${locale}: chooser never asks "do you use OBS"`, () => {
    expect(landingCopy[locale].home.chooser.title).not.toMatch(/use OBS|käytätkö OBS/i);
  });
  test(`${locale}: stories ship empty`, () => expect(landingCopy[locale].stories).toEqual([]));
  test(`${locale}: no "cannot combine" claim`, () => {
    expect(text.join(" ")).not.toMatch(/does not aggregate|ei kuitenkaan yhdistä/i);
  });
}
```

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Rewrite `landing-copy.ts` (en first, then fi; tsc enforces key parity). Update `components/try-cta.tsx` to read `landingCopy[locale].shared.tryCta`. Keep `faq`/`faqFi` exports from `routes/index.tsx` removed — nothing else imports them (verified).
- [ ] **Step 4:** Run tests — PASS. `bun run check-types` will fail in `routes/index.tsx` until Task 7; that is expected, do not patch around it.
- [ ] **Step 5:** Commit `feat(web): lander copy per page, explained through situations`.

### Task 4: SEO helpers, sitemap, llms.txt, comparison fix

**Files:**
- Create: `src/lib/seo.ts`, `src/lib/seo.test.ts`
- Modify: `src/lib/i18n.ts` (`landingHead`, `FI_TWIN`), `src/lib/i18n.test.ts`, `src/lib/comparison.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/llms[.]txt.ts`

**Interfaces:**
- Produces:
  - `landingHead(locale: Locale, path: "/" | "/phone-only" | "/with-obs", title: string, description: string, jsonLd?: object[])` — canonical/hreflang from `localizedHead(locale, path)`, og:url = canonical, scripts = one `application/ld+json` per `jsonLd` entry.
  - `faqJsonLd(locale, items: {q,a}[]): object`, `howToJsonLd(locale, name: string, steps: {title, body}[]): object`, `softwareAppJsonLd(locale): object` (`@type: SoftwareApplication`, `applicationCategory: "MultimediaApplication"`, `operatingSystem: "iOS, Android"`, `offers.price: "0"`).
- `FI_TWIN` = `/^\/(affiliate|blog|contact|cookies|privacy|terms|phone-only|with-obs)?(\/.*)?$/`.

- [ ] **Step 1: Failing tests:**

```ts
// i18n.test.ts
test("landingHead canonical per path", () => {
  const h = landingHead("fi", "/with-obs", "t", "d");
  expect(h.links[0].href).toBe("https://visp-stream.com/fi/with-obs");
  expect(h.links.find((l) => l.hrefLang === "en")?.href).toBe("https://visp-stream.com/with-obs");
  expect(h.meta.find((m) => m.property === "og:url")?.content).toBe("https://visp-stream.com/fi/with-obs");
});
test("otherLocaleHref maps the new pages", () => {
  expect(otherLocaleHref("/phone-only", "")).toBe("/fi/phone-only");
  expect(otherLocaleHref("/fi/with-obs", "")).toBe("/with-obs");
});
// seo.test.ts
test("howTo lists steps in order", () => {
  const j = howToJsonLd("en", "Go live", [{ title: "A", body: "a" }, { title: "B", body: "b" }]) as any;
  expect(j["@type"]).toBe("HowTo");
  expect(j.step.map((s: any) => s.position)).toEqual([1, 2]);
});
test("faq json-ld shape", () => {
  const j = faqJsonLd("fi", [{ q: "Q", a: "A" }]) as any;
  expect(j.mainEntity[0].acceptedAnswer.text).toBe("A");
});
```

- [ ] **Step 2:** Run `bun test src/lib` — FAIL.
- [ ] **Step 3:** Implement. Sitemap: add `/phone-only` and `/with-obs` to both `publicPaths` and `localizedPaths`. llms.txt: replace the "does not aggregate" sentences with the bonding modes (combine, send on both, backup), list the two pages with one-line descriptions, point the comparison link at `/with-obs#compare`. `comparison.ts`: fix the bonding row cell for VISP to "Optional bonding in the app: combine Wi-Fi + cellular, or send on both".
- [ ] **Step 4:** Run — PASS; `curl -s https://visp.localhost/sitemap.xml | grep -c with-obs` → `2`.
- [ ] **Step 5:** Commit `feat(web): per-page SEO head, sitemap and llms.txt for new pages`.

### Task 5: Marketing content components

**Files:**
- Create: `src/components/marketing/signal-strip.tsx`, `hero-video.tsx`, `situation-list.tsx`, `step-list.tsx`, `faq.tsx`, `stories.tsx`, `comparison-table.tsx`, `cost-chart.tsx`, `marketing.test.tsx`
- Modify: `src/index.css` (strip keyframes, table stacking)

**Interfaces:**
- Consumes: types from Task 3.
- Produces (all router-free, copy via props):
  - `SignalStrip({ copy: StripCopy, compact?: boolean })` — inline SVG with `<title>`/`<desc>`, real `<text>` for track labels and LIVE/BRB tags, plus a visible `<ol>` of the three beats. Horizontal ≥ 640px; vertical (time top→bottom, bars left, on-air line right, captions beside) < 640px — two SVGs toggled with `hidden sm:block` / `sm:hidden`, sharing one data array of 12 bar heights `[3,4,4,3,2,1,0,0,0,2,4,4]`. The on-air path is one unbroken `<path>` coloured `--on-air`. Animation: CSS class `.strip-play` on the bars group (`@keyframes strip-bars`, 4s, once, `animation-fill-mode: both`); `@media (prefers-reduced-motion: reduce) { .strip-play { animation: none } }`.
  - `SituationList({ items: Situation[] })` — `<ul>`; heading `<h3>`, body `<p>`, feature in small muted text. No numbers.
  - `StepList({ title: string; items: Step[] })` — `<ol>` with visible numerals (real sequence).
  - `Faq({ copy: Faq })` — `<details>/<summary>`, summary `min-h-14`, answers always in DOM.
  - `Stories({ stories: Story[]; title: string })` — returns `null` when empty; otherwise `<figure><blockquote>` + `<figcaption>` with a link to `channelUrl` (`rel="noreferrer"`).
  - `ComparisonTable({ caption, columns: string[], rows: { label: string; cells: string[] }[] })` — a real `<table>`; every `<td>` gets `data-label={columns[i]}`; CSS under 640px: `table, tbody, tr, td { display:block }`, `thead { position:absolute; clip... }` (sr-only), `td::before { content: attr(data-label) }`. Used for both the competitor table and the phone-vs-OBS table.
  - `CostChart({ copy: CostCopy })` — today's `AnnualCostChart` restyled to tokens.
  - `HeroVideo({ src: string; poster: string; label: string })` — `<video muted loop playsInline poster preload="metadata">`, `max-h-[60svh]`, explicit width/height. After mount, when `matchMedia("(max-width: 639px)")` matches or `navigator.connection?.saveData` is true, it sets `preload="none"` and only calls `play()` once an IntersectionObserver sees it; otherwise it autoplays. Under reduced motion it never autoplays (poster stays).

- [ ] **Step 1: Failing tests** `marketing.test.tsx` using `renderToStaticMarkup` from `react-dom/server`:

```tsx
const en = landingCopy.en;
test("signal strip SSR carries every caption and both tracks", () => {
  const html = renderToStaticMarkup(<SignalStrip copy={en.home.strip} />);
  for (const s of [...en.home.strip.beats, en.home.strip.signalTrack, en.home.strip.viewerTrack]) expect(html).toContain(s);
  expect(html).toContain("strip-play");
});
test("faq answers are in the HTML while collapsed", () => {
  const html = renderToStaticMarkup(<Faq copy={en.phoneOnly.faq} />);
  for (const i of en.phoneOnly.faq.items) expect(html).toContain(i.a);
  expect(html).not.toContain("open");
});
test("stories render nothing when empty", () => {
  expect(renderToStaticMarkup(<Stories stories={[]} title="x" />)).toBe("");
});
test("comparison cells carry data-label for mobile stacking", () => {
  const html = renderToStaticMarkup(<ComparisonTable caption="c" columns={["A", "B"]} rows={[{ label: "r", cells: ["1", "2"] }]} />);
  expect(html).toContain('<table'); expect(html).toContain('data-label="B"');
});
test("hero video ships poster and no autoplay attribute in SSR", () => {
  const html = renderToStaticMarkup(<HeroVideo src="/v.m4v" poster="/p.jpg" label="l" />);
  expect(html).toContain('poster="/p.jpg"'); expect(html).not.toContain("autoplay");
});
test("situations render heading, body, and feature", () => {
  const s = en.phoneOnly.situations[0];
  const html = renderToStaticMarkup(<SituationList items={[s]} />);
  for (const t of [s.heading, s.body, s.feature]) expect(html).toContain(t);
});
```

- [ ] **Step 2:** Run `bun test src/components/marketing` — FAIL.
- [ ] **Step 3:** Implement components and CSS.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit `feat(web): marketing components (signal strip, situations, faq, tables)`.

### Task 6: Header, mobile menu sheet, theme toggle, sticky CTA, footer

**Files:**
- Modify: `src/components/header.tsx`
- Create: `src/components/marketing/mobile-menu.tsx`, `theme-toggle.tsx`, `sticky-cta.tsx`, `marketing-footer.tsx`, `src/components/marketing/chrome.test.tsx`

**Interfaces:**
- Consumes: `useThemePreference` (Task 1), `landingCopy[locale].shared` (Task 3), `TryCta` (existing).
- Produces:
  - `Header({ landing?: boolean })` — unchanged signature. Desktop (≥ 768px): logo, Phone only, With OBS, Docs, Blog, language, `ThemeToggle`, then `TryCta` (signed out on marketing) or `UserMenu`. Dashboard link when signed in, Cloud Studio link when available (kept). Phones: logo, `TryCta` (signed out) / `UserMenu`, menu button. When `landing` the header uses `.mkt` tokens; otherwise it keeps current app styling.
  - `MobileMenu({ locale })` — button (44×44, `aria-expanded`, `aria-controls`) opening a native `<dialog>` via `showModal()`, full height, rows ≥ 56px: Phone only, With OBS, Download, Docs, Blog, language, theme (three-way segmented). Closes on link click, Escape, and the close button; focus returns to the trigger.
  - `ThemeToggle()` — three buttons (`aria-pressed`) light / dark / system.
  - `StickyCta({ locale, sentinelId: string, endId: string })` — fixed bottom bar, `md:hidden`, shown when the `sentinelId` element is out of view and `endId` is not yet in view (IntersectionObserver; hidden on SSR). Classes: `fixed inset-x-0 bottom-0 z-40 pb-[max(0.75rem,env(safe-area-inset-bottom))]`, CTA `h-12 w-full`. The cookie banner is `z-50` and sits above it; Seppo bubble gets `bottom` offset `calc(5rem + env(safe-area-inset-bottom))` on marketing pages while the bar is visible (pass `data-sticky-cta="on"` on `<body>`; CSS moves the bubble).
  - `MarketingFooter({ locale })` — today's footer links, `© 2026 VISP, Pöhinä Group Oy` (no middle dot).

- [ ] **Step 1: Failing tests** `chrome.test.tsx`:

```tsx
test("sticky CTA sits under the cookie banner and clears the home indicator", () => {
  const html = renderToStaticMarkup(<StickyCtaBar label="Start free" />); // presentational inner of StickyCta
  expect(html).toContain("z-40");
  expect(html).toContain("env(safe-area-inset-bottom)");
  expect(html).toContain("h-12");
});
test("theme toggle exposes pressed state", () => {
  const html = renderToStaticMarkup(<ThemeToggleView value="dark" labels={landingCopy.en.shared.nav.theme} onChange={() => {}} />);
  expect(html).toMatch(/aria-pressed="true"[^>]*>[^<]*Dark|Dark[\s\S]*aria-pressed="true"/);
});
```

(`StickyCtaBar` and `ThemeToggleView` are the router/hook-free presentational parts exported from the same files.)

- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; header file keeps one export.
- [ ] **Step 4:** Run — PASS; `bun run check-types` errors only in `routes/index.tsx` (fixed next task).
- [ ] **Step 5:** Commit `feat(web): header with mobile menu sheet, theme toggle, sticky CTA`.

### Task 7: Home page (`/`, `/fi`)

**Files:**
- Modify: `src/routes/index.tsx` (rewrite), `src/routes/fi/index.tsx`

**Interfaces:**
- Consumes: Tasks 2–6.
- Produces: `HomePage({ locale }: { locale: Locale })` exported from `routes/index.tsx`.

Order (spec Home 1–7): hero (`id="hero-cta"` sentinel on the CTA row; H1, body, `TryCta size="lg"`, download link, `HeroVideo src="/marketing/go-live-loop.m4v" poster="/marketing/go-live-loop.jpg"`), `SignalStrip` + `stripNote`, "You don't need OBS for this" checklist (`<ul>`, each item situation + "phone only" marker) with link to `/phone-only`, `more` lines, chooser (two `Link` tiles, whole tile clickable, phone tile filled with `--ink` bg and badge "Most creators", obs tile outlined), `Stories`, `Faq`, closing (`id="closing"`), `MarketingFooter`, `StickyCta sentinelId="hero-cta" endId="closing"`, `SeppoWidget` (kept). Wrapper `<main className="mkt">`. Head: `landingHead(locale, "/", meta.title, meta.description, [faqJsonLd(...), softwareAppJsonLd(locale)])`.

Old anchors: `useEffect` — if `location.hash` is `#compare` or `#workflows`, `window.location.replace("/with-obs#compare")` (fi: `/fi/with-obs#compare`).

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `bun run check-types` in `apps/web` — clean.
- [ ] **Step 3:** `curl -s https://visp.localhost/ | grep -c "Where do you want to make your show"` → ≥ 1; same for `/fi` with the fi chooser title.
- [ ] **Step 4:** Screenshot 1400×900 and 375×667, light and dark (`localStorage["visp-theme"]`). Check: H1 + CTA visible in the first 375×667 viewport; no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`).
- [ ] **Step 5:** Commit `feat(web): new home page`.

### Task 8: Phone-only page (`/phone-only`, `/fi/phone-only`)

**Files:**
- Create: `src/routes/phone-only.tsx`, `src/routes/fi/phone-only.tsx`

**Interfaces:**
- Produces: `PhoneOnlyPage({ locale })` exported from `routes/phone-only.tsx`; the fi route imports it.

Order (spec phone-only 1–9): hero (image `/marketing/app-live.jpg` with width/height, `TryCta`), why Direct exists, `SignalStrip compact`, `SituationList` (never-drop situations), Cloud Studio block with a visible "Beta" badge, more `SituationList` (multistream, keys, category, battery), `ComparisonTable` from `versus`, `CostChart`, `StepList`, `Faq`, closing, footer, sticky CTA. Link to `/with-obs` after the steps. Head: `landingHead(locale, "/phone-only", …, [faqJsonLd, howToJsonLd(locale, steps.title, steps.items)])`.

- [ ] **Step 1:** Implement (dev server running so the route tree regenerates).
- [ ] **Step 2:** `bun run check-types` — clean.
- [ ] **Step 3:** `curl -s https://visp.localhost/phone-only | grep -c "Road trip subathon"` → ≥ 1; `curl -s https://visp.localhost/fi/phone-only | grep -c 'hreflang="en"'` → 1.
- [ ] **Step 4:** Screenshots as Task 7 plus 360px fi.
- [ ] **Step 5:** Commit `feat(web): phone-only page`.

### Task 9: With-OBS page (`/with-obs`, `/fi/with-obs`)

**Files:**
- Create: `src/routes/with-obs.tsx`, `src/routes/fi/with-obs.tsx`

**Interfaces:**
- Consumes: `getObsPluginRelease` (`functions/get-obs-releases.ts`) as route `loader`, `detectObsPluginPlatform` (`lib/obs-releases.ts`), `legalEntity.releasesUrl`.
- Produces: `WithObsPage({ locale, release })`.

Order (spec with-OBS 0–7): no-PC note linking `/phone-only`, hero (`HeroVideo` with the go-live loop), plugin block (steps + "Download the OBS plugin" button picking the asset for the visitor's platform, falling back to `release.htmlUrl` then `legalEntity.releasesUrl`; "Plugin docs" link to `docs.obsRemoteControl`), `SituationList` (OBS situations), studio list, `section id="compare"` with `CostChart` + competitor `ComparisonTable` (from `comparison.ts`, keep `COMPARISON_CHECKED` line), `StepList`, `Faq`, closing, footer, sticky CTA. Head with `faqJsonLd` + `howToJsonLd`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** `bun run check-types` — clean.
- [ ] **Step 3:** `curl -s https://visp.localhost/with-obs | grep -c "<table"` → ≥ 1; visiting `/#compare` in the browser lands on `/with-obs#compare`.
- [ ] **Step 4:** Screenshots as Task 7.
- [ ] **Step 5:** Commit `feat(web): with-OBS page`.

### Task 10: Whole-site verification

**Files:** none new (fixes go in the files they belong to)

- [ ] **Step 1:** `bun test apps/web` and `bun run check-types` in `apps/web` — all pass.
- [ ] **Step 2:** `bunx biome check apps/web/src` — clean (root `bun run check` is broken by an unrelated config; run on the directory).
- [ ] **Step 3:** For each of `/`, `/fi`, `/phone-only`, `/fi/phone-only`, `/with-obs`, `/fi/with-obs`: `curl -s` and confirm exactly one `<h1`, a canonical link, `hreflang` en/fi/x-default, and `application/ld+json`.
- [ ] **Step 4:** Screenshots of every page at 375×667, 390×844, 430×932, 360×780 and 1400×900, light and dark; with the cookie banner open at 375×667; check no overflow (`scrollWidth === innerWidth`) and that the sticky bar shows after the hero and hides at the closing CTA.
- [ ] **Step 5:** Reduced motion: emulate `prefers-reduced-motion: reduce` (`matchMedia` check in the page) — strip renders still, nothing animates.
- [ ] **Step 6:** Keyboard: tab through home on desktop and with the mobile menu open — focus is visible on every stop, Escape closes the menu and returns focus.
- [ ] **Step 7:** App routes unaffected: `/login` renders dark with `localStorage["visp-theme"]="light"`; `/blog` follows the theme.
- [ ] **Step 8:** Commit any fixes `fix(web): lander verification fixes`.
