# Plans and billing

Design only. Nothing here is implemented. Decided with Joni on 2026-10-14 and
grilled on 2026-10-15: **Free + Plus at €9/month**, **Direct stays free and
uncapped**, **Polar** as the payment provider.

Today four `app_user` booleans (`better_tts`, `better_audio_isolation`,
`better_subtitles`, `brb_highlights`) are flipped by an admin. Typography export
needs only a session; OBS backup only the OBS control token. TTS and audio
isolation are metered (`hosted_usage`, priced by `unit_price`); subtitles are
not, because the server only mints a single-use Scribe token and the client
streams to ElevenLabs directly. This document turns the flags into entitlements
derived from a plan, adds quotas, and lets users pay without an admin.

## 1. Plan model

Two plans. Free is today's product: relay, OBS plugin, Direct (uncapped, relay
capacity remains the only gate), BRB card, chat bot, on-device voice, captions
and isolation. Plus adds every hosted feature.

| Feature | Free | Plus (€9/mo, VAT incl.) | Metered where |
| --- | --- | --- | --- |
| TTS (ElevenLabs) | device voice | 300k characters/mo | `apps/server/src/tts.ts` |
| Live subtitles (Scribe) | on-device | 20 h audio/mo | token mint + client report (section 2) |
| Audio isolation | iOS isolation | 20 h audio/mo | isolation audio meter |
| BRB highlights | — | 5 clips (existing `MAX_BRB_HIGHLIGHTS`) | existing clip count |
| Typography export | — | 10 exports/mo | `requestTypographyExport` |
| OBS backup | — | 10 backups, 1 GiB per file, 2 GiB per backup, 5 GiB total | `obs-backup.ts` limits |
| Direct, dual output | free; dual stays an admin flag | same | not billed |

Prices are EUR only at launch. Quotas are initial values in one constant map,
tuned from per-user spend on the admin Usage page.

**Schema (additive, no data migration):** on `app_user`:

- `plan text not null default 'free'` (check `in ('free','plus')`), written
  only by the Polar webhook and `syncPlans`.
- `plan_status text` (`active` | `past_due` | null) and
  `plan_period_end timestamptz`, also Polar's.
- `comped boolean not null default false`, written only by an admin.

Nothing is backfilled. Polar customers are keyed by `external_id = user.id`:
no customer id column.

**Derivation.** One function replaces `betterFeatures()`
(`packages/api/src/better-features.ts`):

```
entitled(feature) = plan === 'plus' || comped || override[feature] === true
```

The four booleans stay as **legacy overrides** for the per-feature early
access users have today; they exist only for TTS, subtitles, isolation and
highlights. Typography export and OBS backup have no override: they need
`plus` or `comped`.

**Affiliates and founding creators** are comped. The existing `/affiliate`
form and `affiliate_application` table stay as they are; the admin reads the
application and switches *Comped* on that user's admin page by hand. No card,
no Polar customer. A comped user who later subscribes and cancels stays comped,
because the webhook never touches `comped`. Plus quotas apply to comped users
and overrides alike, so comped spend stays bounded and visible on the Usage
page. There is no "force off": bans cover abuse.

The admin user page (`user-detail-panel.tsx`) keeps its toggles, relabelled
*Override*, adds a *Comped* toggle, and gains a read-only plan line (plan,
status, period end, link to the Polar customer).

## 2. Quotas

Quotas are monthly, calendar month UTC, per (user, feature). The ledger is
`hosted_usage` as it is; no counter table. The month's total is one indexed
query (`hosted_usage_user_occurred_at_idx`). New `HOSTED_USAGE_FEATURES`
entries: typography export with a new unit `items`, recorded when an export
job is queued. `subtitles` already exists as a feature and starts being
recorded (below).

`entitlement(userId, feature)` returns `{ allowed, remaining }` with
`remaining = quota − month's hosted_usage`. It is called where the 403 or "not
enabled" is returned today: `apps/server/src/tts.ts`, `subtitles.ts`,
`audio-isolation.ts`, `packages/api/src/brb-highlights.ts`, the typography
route and the OBS backup upload in `apps/server/src/machine.ts`. `chat.speech`
reads it too, so clients only offer what is allowed.

**At zero, nothing running is cut off.**

- TTS is per request: the request is refused (429) and the native client's
  existing `expo-speech` fallback speaks it.
- Isolation and subtitles refuse to **start** a new session. A session already
  running continues until the stream ends. These two have no on-device
  fallback on a mid-stream failure today, so the server never ends one.
- Highlights, typography export and OBS backup refuse with "Monthly quota
  used, resets 1 Nov" (backup: its existing size caps). No top-ups.

**Subtitles metering.** Minting a Scribe token records 60 s up front. The
client then reports elapsed seconds every 60 s through a tRPC mutation, after
its first minute. A crashed or modified client under-reports, but each mint
still costs a minute, which bounds mint spam. No anti-cheat beyond that.

**OBS backup** is a stock, not a flow, and never touches `hosted_usage`. The
existing limits become the Plus allowance: 10 retained backups, 1 GiB per
file, 2 GiB per backup, 5 GiB per account (`packages/api/src/obs-backup.ts`).
After a downgrade, restore, download and delete keep working; only new
backups are refused.

**Overrun bound.** Usage still in the in-process buffer (flushed every 60 s) is
not counted, and a running isolation or subtitles session continues past zero.
The worst case is one flush per process plus the remaining length of sessions
already running. Accepted for launch; if a user shows up on the Usage page,
add a hard stop at 2× quota. The hot path takes no lock.

**Where the advisory lock goes.** The daily reconcile job (section 3) runs
under `tryAdvisoryLock("plan-sync")`, like `daily-metrics` and the path
reconciler, so one process does it however many are deployed.

## 3. Polar

Polar is a merchant of record: it is the seller, charges VAT per EU country,
files OSS, invoices the customer and pays VISP out. The Finnish Oy books one
Polar settlement a month and needs no VAT registration abroad. EUR prices,
VAT-inclusive display.

**Integration, smallest that works.**

- `packages/auth`: add `@polar-sh/better-auth` with `checkout` (one product,
  slug `plus`, `authenticatedUsersOnly`) and `portal`. Checkout and the
  customer portal (card update, cancel, invoices) are Polar-hosted pages;
  VISP renders no billing forms.
- `apps/server/src/billing.ts`: `POST /api/webhooks/polar`, next to the Kick
  webhook and already covered by the `/api/webhooks/**` exclusion from
  `identifyUser`. Raw body, signature checked with the SDK's
  `webhooks.validateEvent` (`@polar-sh/sdk/2026-10`), 401 on bad signature.
  Polar sends `customer.state_changed`; the payload is only a trigger. The
  handler takes `external_id` and re-reads the user's subscriptions to the
  Plus product (`subscriptions.list`, status `active`, `trialing` or
  `past_due`), so replays and out-of-order deliveries are harmless, and past
  due is seen whether or not Polar's customer state lists it. Other events
  get 204; a failed re-read gets 502 so Polar retries.
- `packages/api/src/billing.ts`: `planFromSubscriptions` (the mapping:
  `plus` while any such subscription exists, `status` `past_due` or
  `active`, `current_period_end`), `syncUserPlan(userId)`, and `syncPlans()`:
  every 6 h, under `tryAdvisoryLock("plan-sync")`, it re-reads users still
  `plus` whose `plan_period_end` is more than three days past. That is the
  only guard against a missed webhook.
- `packages/auth/src/polar.ts`: the client (`POLAR_ACCESS_TOKEN`,
  `POLAR_SERVER` sandbox or production) and the plugin, enabled only when
  `POLAR_ACCESS_TOKEN` and `POLAR_PRODUCT_ID` are set.
- tRPC `plan.me` returns plan, status, period end, `comped`, per-feature
  quota and `remaining`, and `canCheckout` / `canManage`. The web dashboard
  calls the plugin's `POST /api/auth/checkout {slug: "plus"}` and
  `/api/auth/customer/portal` and follows the returned Polar URL. Comped
  users get no checkout. The native app and OBS plugin never open checkout.

**Failed payment.** Polar moves the subscription to `past_due`, emails the
customer and retries over 21 days. VISP keeps Plus through all of `past_due`
and shows one banner ("Payment failed. Update your card.") linking to the
portal. When Polar gives up the status becomes `canceled`, the state event
arrives and `plan` falls back to `free`: hosted features stop at the next
entitlement check, clips and backups are kept (highlights follow the existing
`brb_highlights_deleting` path only on account delete). Cancel at period end:
Polar keeps the subscription `active` until `period_end`, then the same event
flips it. No VISP timer exists for any of this.

**Prices.** ElevenLabs is currently comped for VISP, so hosted speech costs
nothing today. `unit_price` still gets ElevenLabs **list prices** for TTS,
isolation and subtitles (a shadow cost), so the Usage page shows what a Plus
user would cost once the comp ends and quotas can be tuned before it does.
Entering those rows is part of PR 2.

## 4. Dashboard and setup wizard

Minimum visible, detail behind expanders, as the rest of the dashboard. Hosted
speech features live in the native app only; the web dashboard shows plan,
usage, typography and backup.

- **One plan line** in the Home status card: *Free · Upgrade to Plus*, *Plus · renews
  12 Nov* or *Plus (Affiliate)*. The link opens Polar checkout or portal.
  Nothing else is added above the fold.
- **Plan and usage**: a `DetailSection` on the Advanced tab, collapsed by
  default. It lists every Plus feature with its quota, one bar per metered
  feature (used / quota, resets on date), and one upgrade link.
- **Typography export and OBS backup** have no web surface today, so their
  *Plus* tags arrive with the clients that show them (PR 3).
- **Past due**: a single banner at the top of the dashboard, nowhere else.
- **Setup wizard**: unchanged. Direct is free, so no step asks about money.
  The completion step gains one sentence: "Hosted voice, captions and
  highlights are part of Plus" with the upgrade link.
- **Native app / OBS plugin**: a neutral *Plus* tag from `plan.me` on feature
  cards that are not entitled. No URL, no "manage on web" text, no call to
  action: App Store guideline 3.1.1 forbids pointing to outside purchase, and
  3.1.3(b) allows unlocking what was bought elsewhere. Android uses the same
  tag. Quota exhausted: the card says "Monthly quota used, resets 1 Nov".
- **Landing and README**: "Free during beta" and "$0 during beta" in
  `landing-copy.ts` become "Free" and "€9/mo for hosted extras"; README's
  "does not bill users" goes.
- **Affiliate note wherever a price is shown on the web.** One shared string
  in `landing-copy.ts`: *"Creators with an audience can apply to the Affiliate
  program and get every feature free.\*"*, linking to `/affiliate`, the
  asterisk reading "Plus quotas apply." It sits under the landing cost chart
  and FAQ price answer, the dashboard plan line, every web *Plus* tag and the
  usage expander. Not in the native app (same App Store rule). Checkout
  itself is Polar's page and cannot carry it.
- **Admin**: plan line, *Comped* toggle and *Override* relabel from section 1;
  the Usage page gains a "Plus subscribers" count next to per-user spend.

## 5. Implementation plan

**PR 1, entitlements and quotas (no money changes hands).** Schema columns;
`entitlement()` replacing `betterFeatures()` at every gate, including
typography and OBS backup, gated with no grace (current users of those two
lose them until they subscribe or are comped); `items` unit and typography
metering; subtitles metering (mint charge and client report); refusal of new
sessions at zero; `plan.me` without
checkout URLs; dashboard plan line, usage expander and web *Plus* tags; admin
*Comped* toggle and relabel. Tests: entitlement truth table (plan × comped ×
override), refusal at zero, mint charge.

**PR 2, Polar.** Auth plugin, webhook route, `applyCustomerState`, `syncPlans`
job, past-due banner, checkout and portal links in `plan.me`, `unit_price`
list-price rows, landing and README copy. Tests: webhook signature and replay,
snapshot-to-plan mapping, one subscribe-then-cancel round trip in the Polar
sandbox.

**PR 3, clients.** Native app and OBS plugin *Plus* tags, Usage page
subscriber count. On-device fallback when hosted isolation or subtitles stop
mid-stream, which would allow ending a session at quota zero later. Can ship
after launch.

**Open, not blocking:** a trial (the state event already carries
`trialing`); annual pricing; top-ups; a USD price; moving `direct_dual_output`
to Plus once encoder minutes have a unit price.
