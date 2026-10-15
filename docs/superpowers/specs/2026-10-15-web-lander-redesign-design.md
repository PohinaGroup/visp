# Web lander redesign: home, phone-only, with-OBS

Sub-project 1 of the `apps/web` redesign. Setup wizard and dashboard follow as
their own specs.

## Problem

Users say they don't understand what VISP is for or how to use it. The current
lander leads with "Stop paying for cloud OBS", which only lands with people who
already pay for cloud OBS, and it uses system words ("relay", "Direct",
"ingest") before saying plainly that VISP streams a phone to Twitch, Kick, and
YouTube. VISP's strongest feature — the stream stays on air when the phone's
signal drops — is buried in a four-card grid.

## Goals

- A first-time visitor can say in one sentence what VISP does.
- Both audiences (phone-only creators and OBS users) find their page from the
  home screen's first viewport.
- The page sells what makes VISP better: the never-drop chain, multistreaming
  from one upload, no stream key on the phone, OBS control without open ports,
  and Direct is free.
- Pricing follows `docs/plans-and-billing.md` (Free + Plus): prices read
  "Free", BRB highlight clips are marked "(Plus)" wherever they are promised,
  and the shared affiliate note sits under every price.
- SEO is at least as good as today: every page server-rendered, indexable, and
  targeting its own search intent.

## Non-goals

- Setup wizard and dashboard changes (later sub-projects).
- New product features. Every claim on the pages must exist today.
- Invented testimonials. Stories are real, user-supplied, with permission.

## Positioning: why Direct exists

Most visitors believe the good parts of IRL streaming — never dropping off
air, a BRB screen, overlays and alerts — need OBS running on a computer (their
own, or a $120–180/month cloud OBS). Asked "do you use OBS?", they answer yes
and pick OBS, even when they would be better off without it.

Direct was built to remove that dependency: VISP's server does the job the
home or cloud OBS used to do. The pages say so directly, and the default story
is phone only. OBS is the option for people who already have a studio they
love, not the safe default.

What you get with phone only (Direct), all without OBS:

| Feature | How |
| --- | --- |
| Never drop off air | Never drop again: viewers see a BRB card while the phone is offline, VISP switches back by itself |
| Highlight clips while away (Plus) | BRB highlights play your uploaded clips instead of a still card |
| Overlays, scenes, alerts (beta) | Cloud Studio: up to 3 scenes, 8 layers each, browser sources such as alert widgets, one VISP alert layer |
| Stay connected on bad networks | Network bonding in the app: combine Wi-Fi and mobile data, or send every packet over both |
| Chat knows when you drop | Chat bot posts on drop and return |
| Several platforms at once | One upload, a separate output per platform that retries on its own |
| No stream key on the phone | Keys are fetched server-side only while output runs |

Cloud Studio is always labelled **beta** wherever it appears.

### Explain with real situations

Every feature is introduced by a situation the visitor has lived through, then
what VISP does about it, then the feature name. The situation is the heading;
the feature name is the small print. No feature appears as a bare name
("Network bonding") without its situation.

| Situation (heading) | What VISP does | Feature |
| --- | --- | --- |
| **Road trip subathon.** In a moving car the signal drops every few minutes. Each drop ends the broadcast, splits the subathon into ten VODs, and sends viewers away. | The stream never goes offline. While the phone fights for signal, viewers watch your uploaded clips, and VISP cuts back to live the moment you reconnect. | Never drop again + BRB highlights |
| **Festival crowd.** Thirty thousand phones on one cell tower, and your upload crawls. | The app streams over Wi-Fi and mobile data at the same time, or sends every packet over both, so one jammed network doesn't freeze you. | Network bonding |
| **Into the tunnel.** You vanish and chat starts asking if the stream died. | The chat bot posts "signal lost, back soon" when you drop and "we're back" when you return, so mods and viewers know to stay. | Chat bot alerts |
| **Sub goal on a hike.** You want alerts and a goal bar on screen, but there's no PC at home to run them. | Build scenes in the browser with your alert widget and overlays; VISP adds them to the stream on its server. | Cloud Studio (beta) |
| **Twitch and Kick at once.** Two streams from one phone usually means twice the upload and a hot, dying battery. | Your phone sends one feed; VISP sends it to every platform, and if one platform has a problem the others keep going. | Multistream |
| **Lost phone at a festival.** Or you lend it to a friend for the day. | Your stream key is never on the phone. Remove the device from your dashboard and it can't stream as you again. | Keys stay server-side, revocable devices |
| **New city, new category.** You've gone from Just Chatting to Travel & Outdoors and you're nowhere near a PC. | Change the title and category from the app. | Stream info from the phone |
| **Battery at 3%.** The show must go on. | Start streaming on a second phone; it takes over the stream. | Device handoff |

With-OBS situations, used on `/with-obs`:

| Situation | What VISP does | Feature |
| --- | --- | --- |
| **Your studio is at home, you're not.** Your scenes, alerts, and sponsor graphics live on the home PC. | The phone becomes a camera in that OBS from anywhere, and the plugin adds it to the current scene in one click. | VISP OBS plugin |
| **Mid-walk scene change.** You need to switch to the "be right back" scene without anyone at the PC. | Switch scenes and start or stop OBS from the phone. No ports opened on your home network. | Remote OBS control |
| **A guest in another city.** You want them on screen without handing over your stream key. | Add a guest device and send them its link. They stream from their browser into your OBS, and you remove the device when the show is over. | Remote guest |

The signal strip uses the road-trip story for its three captions:
"Signal weakens on the highway", "Dead zone: viewers watch your clips",
"Back in range: live again".

All situations must stay true to current behavior. If a feature changes, the
situation changes with it.

Rules that follow:
- Never frame the choice as "Do you use OBS?". Frame it as where the show is
  made: on VISP (phone only) or in your own OBS.
- Every never-drop, BRB, highlight, and overlay claim says "no computer
  needed" next to it.
- The cost argument applies to phone only too: Direct replaces the rented
  cloud OBS as much as your own OBS does.

## Pages

All three exist in English and Finnish. Copy lives in `lib/landing-copy.ts`,
one object per page per locale, `fi` typed as `typeof en`.

### `/` and `/fi` — Home

Job: say what VISP is, prove the never-drop promise, route the visitor.

1. **Hero.** H1 "Go live from your phone. Stay live when the signal doesn't."
   One-sentence body: VISP streams your phone to Twitch, Kick, and YouTube and
   keeps your channel on air through dead zones — no computer needed, or bring
   the phone into your own OBS. Primary CTA "Start free" (login, or dashboard
   when signed in). Secondary link "Download the app". The real go-live video
   (`/marketing/go-live-loop.m4v`, poster jpg) beside it.
2. **Signal strip** (the signature, full width). Two tracks:
   "Your signal" (meter bars) and "What viewers see" (on-air line). The bars
   weaken, fall to zero in a dead zone, and recover; the on-air line goes
   LIVE → BRB → LIVE without breaking. Three beats captioned under it:
   - Signal weakens: the app sends over Wi-Fi and mobile data together
     (Network bonding).
   - Signal gone: viewers see your BRB screen or highlight clips instead of
     "stream ended", and the chat bot tells chat (Never drop again).
   - You're back: VISP switches back to live by itself.
   A line under the strip: "All of this runs on VISP. No computer at home,
   no cloud OBS to rent."
3. **"You don't need OBS for this."** The misconception-buster: the feature
   list from Positioning as a compact checklist (never drop, highlight clips,
   overlays and alerts — beta, bonding, chat alerts, multistream, no stream
   key on the phone), each marked "phone only". Links to `/phone-only`.
4. **Chooser.** H2 "Where do you want to make your show?" Two tiles:
   - "On VISP, from my phone" (filled, first, labelled *Most creators*):
     "Everything above, no computer." → `/phone-only`
   - "In my own OBS" (outlined): "Already have a studio with scenes you love?
     Bring your phone into it." → `/with-obs`
5. **Stories.** Real creator stories from `landingCopy[locale].stories`
   (name, channel URL, what they stream, quote, optional photo). The section
   renders nothing when the list is empty.
6. **FAQ** (general questions), collapsed `<details>`, answers in the DOM.
7. **Footer** (existing links).

### `/phone-only` and `/fi/phone-only`

Search intent: "stream from phone without OBS", "IRL stream from phone to
Twitch/Kick", "stream drops on mobile data".

1. Hero: H1 "Everything OBS did for your stream. Without the computer."
   Body: never drop off air, highlight clips, overlays and alerts, all from
   one phone. Phone screenshot (`app-live.jpg`), "Start free".
2. **Why Direct exists.** Short, plain story: to stay live through dead
   zones and show a BRB screen or overlays, IRL streamers used to need a
   computer at home running OBS, or a cloud OBS at $120–180 a month. Direct
   moves that job onto VISP. Your phone sends one feed; VISP builds the show
   and keeps it on air.
3. Never-drop in full: a compact signal strip, then the layers — Network
   bonding (combine Wi-Fi + mobile data, or send every packet over both),
   Never drop again (BRB card, custom image, or highlight clips; switches back
   by itself), chat bot alerts on drop and return.
4. **Overlays and alerts (beta).** Cloud Studio: scenes, layers, alert
   widgets as browser sources, the VISP alert layer, edited in the browser and
   switched from the phone. Labelled beta.
5. What else you get: multistream to Twitch, Kick, and YouTube from one upload
   (each platform retries on its own); stream key stays server-side; change
   title and category from the phone.
6. **Phone only vs your own OBS** — a real `<table>` with the Positioning
   features as rows and both routes as columns, so the visitor sees phone
   only is not the lesser option. Rows where OBS is genuinely stronger
   (local microphones, complex multi-camera scenes, local recording) say so.
7. Cost: the 12-month cost chart, with "VISP phone only" and "VISP + your
   OBS" both reading "Free" against cloud OBS, the affiliate note under it.
8. How it works — a real three-step sequence, numbered: sign in with Twitch,
   Kick, or Google → pick where to stream → open the app and tap Go live.
9. FAQ for this route (includes "Do I need OBS for a BRB screen or
   overlays?" — answer: no); closing CTA.

### `/with-obs` and `/fi/with-obs`

Search intent: "phone as camera in OBS", "remote OBS camera over internet",
"cloud OBS alternative", "IRLToolkit alternative".

0. A short note at the top: "Don't have a studio PC? You don't need one —
   phone only does never-drop, highlights, and overlays too." → `/phone-only`
1. Hero: H1 "Your phone, live in your OBS, from anywhere." Go-live video
   (it shows the feed arriving in OBS), "Start free".
2. **The VISP OBS plugin**: install, Tools → VISP, sign in in the browser,
   add your phone to the current scene in one click; start/stop OBS and switch
   scenes from the phone; outbound connection only, no open ports. Plugin
   download button (reuses `getObsPluginRelease` + `detectObsPluginPlatform`).
3. Same phone-side protection: Network bonding; OBS keeps your own holding
   scene while the phone reconnects.
4. Keep your studio: scenes, overlays, alerts, plugins, local recording,
   remote guests.
5. Cost: the 12-month cost chart and the full comparison `<table>` (moved from
   the current home page, `lib/comparison.ts`).
6. How it works, numbered three steps: install the plugin and sign in → add
   the phone as a source → go live from the phone.
7. FAQ for this route; closing CTA.

### Copy fixes carried along

The current FAQ and `llms.txt` say the app cannot combine connections. The
native app now has SRTLA bonding (`srtla`), send-on-both (`broadcast`), and
backup modes. Fix both, and the matching row in `lib/comparison.ts`.

## Visual system

The logo (wordmark + `MeterMark`) is unchanged. Everything else is new.

Concept: *your signal versus what viewers see.* The meter-bar logo doubles as
signal bars, and the signal strip is the one memorable element.

### Color

Tokens are defined once as CSS variables on the marketing wrapper, with a dark
set under `.dark`. Color carries signal state only.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` | `#E9EDF0` overcast | `#0E1A28` night navy | page background |
| `--surface` | `#FFFFFF` | `#152536` | raised tiles, video frame |
| `--ink` | `#12263B` asphalt navy | `#E9EDF0` | text, primary buttons, viewer track |
| `--ink-muted` | `#4B5D70` | `#9FB0C0` | secondary text |
| `--on-air` | `#E5352B` | `#F0483D` | LIVE state, unbroken on-air line only |
| `--signal` | `#2E9B5C` | `#3FBF74` | healthy signal bars only |
| `--weak` | `#E9A23B` | `#F0B44C` | weak signal bars only |

All text/background pairs meet WCAG AA (checked during build).

### Type

Archivo variable (`@fontsource-variable/archivo`, width + weight axes), one
family:
- Headlines: width ~118, weight 800, sentence case, tight leading.
- Body: width 100, weight 400, 17–18px, line length ≤ 70ch.
- IBM Plex Mono only for literal URLs and codes.

Barlow and Barlow Condensed stay installed for the app pages until their
redesign.

### Layout and rules

- Left-aligned, max width 1200px, 16px side gutter on phones, no horizontal
  scroll.
- Removed template tells: mono uppercase eyebrows over every heading, 01/02/03
  markers except on real step sequences, middle-dot lists, hairline newspaper
  grids, arrows on buttons.
- Motion: only the signal strip animates, once, on load. Under
  `prefers-reduced-motion` it renders as a still frame (dead zone visible, on-
  air line unbroken). Disclosure toggles animate on user action only.
- Visible keyboard focus on all interactive elements.

### Mobile first

Most visitors want to stream from a phone and are reading on one. Pages are
designed at 375px first, then widened.

- **First viewport on a phone:** logo bar, H1, one-sentence body, "Start free"
  — all visible without scrolling at 375×667. The video sits directly below,
  capped at 60svh, poster-first.
- **Sticky action bar:** once the hero CTA scrolls out of view, a slim bar
  pinned to the bottom shows "Start free" (full width, 48px tall), respecting
  `env(safe-area-inset-bottom)`. It hides again near the closing CTA. The
  cookie banner and Seppo bubble sit above it, never on top of it.
- **Header:** logo, "Start free", and a menu button. The menu is a full-height
  sheet (native `<dialog>`) with Phone only, With OBS, Download, Docs, Blog,
  language, and the theme toggle as large rows. No hidden-on-mobile links that
  have no other way in.
- **Signal strip on phones:** it turns vertical. Time runs top to bottom,
  the signal bars on the left and the on-air line on the right, with each beat's
  caption beside its moment, so nothing is shrunk to unreadable size.
- **Chooser tiles:** stacked full width, the whole tile is the tap target.
- **Comparison table:** stays one `<table>` in the DOM (SEO). Under 640px CSS
  turns each row into a labeled block per product (`data-label` on cells), so
  it reads top to bottom with no sideways scrolling.
- **Touch and type:** every tap target ≥ 44×44px with ≥ 8px between; body text
  17px minimum; H1 uses `clamp()` so long Finnish words never overflow
  (`hyphens: auto`, `overflow-wrap: anywhere` on headings).
- **FAQ:** full-width `<summary>` rows, ≥ 56px tall.
- **Mobile data:** the video uses `preload="none"` on narrow screens or when
  `Save-Data` is on, and plays once it scrolls into view; the poster is the LCP
  image, sized per viewport.
- **Checked on:** 375×667 (iPhone SE), 390×844, 430×932, and a 360px-wide
  Android, in both themes, with screenshots of every section.

### Theme

- Light and dark, defaulting to the system preference, with a toggle in the
  header. `next-themes` (already installed) sets the `html` class before paint
  so there is no flash.
- The public pages (home, route pages, blog, download, legal, affiliate,
  contact) follow the chosen theme. The `_auth` app routes, `/studio`,
  `/overlay`, and `/device` stay forced dark until their own redesign; the
  astryx `<Theme mode>` follows the same rule.

## SEO

- All three pages are fully server-rendered; no content depends on client JS.
  The signal strip is inline SVG with real `<text>` labels and a text
  caption, not canvas.
- One `<h1>` per page, ordered `<h2>`/`<h3>`; the comparison stays a real
  `<table>`.
- Per-page `<title>`, meta description, canonical, `hreflang` en/fi/x-default,
  Open Graph/Twitter tags. `landingHead` takes the page path instead of
  hard-coding `/` and `/fi`.
- JSON-LD: `FAQPage` per page (its own questions), `SoftwareApplication` on
  home (free offer, iOS/Android), `HowTo` on the two route pages for the
  three steps.
- Sitemap and `FI_TWIN` gain `/phone-only` and `/with-obs` with alternates.
  `llms.txt` gains both pages and points the comparison at `/with-obs`.
- Old anchors: `/#compare` and `/#workflows` stay reachable — the home page
  links to `/with-obs#compare`, and a small client effect on home redirects
  those hashes (hashes never reach the server).
- Performance: video `preload="metadata"` with poster; Archivo loaded as a
  single variable woff2 with `font-display: swap`; hero image has width and
  height to avoid layout shift.
- Internal links: home → both route pages, each route page → the other and to
  the relevant blog posts.

## Code shape

- `routes/index.tsx` slims to the home page; new `routes/phone-only.tsx`,
  `routes/with-obs.tsx`, `routes/fi/phone-only.tsx`, `routes/fi/with-obs.tsx`
  (the fi files reuse the English components with `locale="fi"`, as
  `routes/fi/index.tsx` does now).
- Shared marketing pieces in `components/marketing/`: `SignalStrip`,
  `StepList`, `Faq`, `Stories`, `ClosingCta`, `MarketingFooter`.
- `components/header.tsx` keeps one header for every page; nav becomes
  Phone only, With OBS, Docs, Blog, FI/EN, theme toggle, and the action.
- `lib/landing-copy.ts` restructured per page; type checks keep fi in sync.

## Testing

- `bun run check-types` in `apps/web`.
- Existing tests that import `faq`/`faqFi` from `routes/index` are updated.
- A small test for `landingHead` canonical/hreflang per path, and one that
  every page's copy has the same keys in en and fi (already enforced by type).
- Manual: screenshots of all three pages at 1400px and 375px in light and dark,
  reduced-motion check, keyboard tab-through, view-source check that all copy
  is in the SSR HTML.

## Open items

- Customer stories: the user will paste real stories with permission.
