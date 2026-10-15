# Plans and billing

Decided with Joni on 2026-10-14:
**Free + Plus at €9/month**, **Direct stays free and uncapped**, **Polar** as
the payment provider.

Today four `app_user` booleans (`better_tts`, `better_audio_isolation`,
`better_subtitles`, `brb_highlights`) are flipped by an admin. Typography export
and OBS backup have no gate beyond login. Only TTS, subtitles and audio
isolation are metered (`hosted_usage`, priced by `unit_price`). This document
turns the flags into entitlements derived from a plan, adds quotas at the
metering point, and lets users pay without an admin.

## 1. Plan model

Two plans. Free is today's product: relay, OBS plugin, Direct (uncapped,
relay capacity remains the only gate), BRB card, chat bot, on-device voice,
captions and isolation. Plus adds every hosted feature.

| Feature | Free | Plus (€9/mo, VAT incl.) | Metered where |
| --- | --- | --- | --- |
| TTS (ElevenLabs) | device voice | 300k characters/mo | `apps/server/src/tts.ts` |
| Live subtitles | on-device | 20 h audio/mo | subtitles audio meter |
| Audio isolation | iOS isolation | 20 h audio/mo | isolation audio meter |
| BRB highlights | — | 25 clips (existing cap) | existing clip count |
| Typography export | — | 10 exports/mo | `requestTypographyExport` |
| OBS backup | — | 2 GB stored | `obs_backup.total_bytes` |
| AI chat moderator (Claude Haiku) | — | 2M tokens/mo | `packages/api/src/chat/moderator.ts` |
| Direct, dual output | free; dual stays an admin flag | same | not billed |
| Stream watermark | VISP mark burned into the video | none | not billed |

Quotas are initial values, kept in one constant map, tuned from the Costs
page's per-user spend against `unit_price`.

**Schema (additive, no data migration):** three nullable-safe columns on
`app_user`: `plan text not null default 'free'` (check `in ('free','plus')`),
`plan_status text` (`active` | `past_due` | null) and
`plan_period_end timestamptz`. Nothing is backfilled. Polar customers are
keyed by `external_id = user.id`: no customer id column.

**Derivation.** The four booleans stay as **admin overrides**. One function
replaces `betterFeatures()`:

```
entitled(feature) = plan === 'plus' || override[feature] === true
```

Every user an admin has enabled keeps working the day this ships, because
their override is true and the plan defaults to free. Overrides are also how
**affiliate and founding creators** get every feature free: the admin accepts
the application and sets all overrides, no card, no Polar customer. Plus
quotas still apply to overrides, so comped spend stays bounded and visible on
the Costs page. There is no "force off": bans cover abuse. The
admin user page keeps its toggles, relabelled *Override*, and gains a read-only
plan line (plan, status, period end, link to the Polar customer).

## 2. Quotas at the metering point

Quotas are monthly, calendar month UTC, per (user, feature). The ledger is
`hosted_usage` as it is; no counter table. The month's total is one indexed
query (`hosted_usage_user_occurred_at_idx`). Typography export becomes a
feature in `HOSTED_USAGE_FEATURES` with a new unit `items`, recorded when an
export job is queued. OBS backup is a stock, not a flow: its cap is checked
against `sum(total_bytes)` at upload start and never touches `hosted_usage`.

`entitlement(userId, feature)` returns `{ allowed, remaining }` and is called
where the 403 is returned today (the top of each route in `apps/server`, the
BRB highlights and typography service functions). `remaining` = quota −
month's `hosted_usage` − units still pending in this process's buffer (the
buffer exposes a per-key `pending()` read; it is a `Map` lookup). The audio
meters already hand their total to `recordHostedUsage` every 10 s; at that
point they also re-check `remaining` and end the hosted stream when it hits
zero. The client's existing fallback (device voice, on-device STT, iOS
isolation) takes over, so a stream never stops because a quota did.

**Overrun bound.** Other processes' usage is invisible until their minute
flush, so two devices can overrun by one flush plus one meter interval per
process: cents. A per-user `pg_advisory_xact_lock` would not close it because
writes are buffered, so the hot path takes no lock.

**Where the advisory lock goes.** The daily reconcile job (section 3) runs
under `tryAdvisoryLock("plan-sync")`, exactly like `daily-metrics` and the
path reconciler, so one process does it however many are deployed.

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
  webhook and already excluded from `identifyUser`. Raw body, signature
  checked with the Polar SDK's `validateEvent`, 401 on bad signature. It
  subscribes to one event, `customer.state_changed`, a full snapshot of the
  customer's subscriptions, so handling is idempotent and order-insensitive:
  `plan = 'plus'` if any subscription for the Plus product is `active` or
  `past_due`, else `'free'`; copy `status` and `current_period_end`. Replays
  are harmless; the endpoint returns 204 on duplicates.
- `packages/api/src/billing.ts`: `applyCustomerState(userId, state)` (the
  update above) and `syncPlans()`: the daily job, under the advisory lock,
  that re-fetches customer state for users whose `plan_period_end` is more
  than three days in the past and are still `plus`. The other guard against
  a missed webhook is `plan.sync`: checkout returns to `/dashboard?plus=1`,
  and the dashboard re-reads the plan from Polar right there.
- tRPC `plan.me` returns plan, status, period end, per-feature `remaining`,
  checkout URL and portal URL. The native app and OBS plugin read this; they
  never open checkout themselves (App Store rules; web only).

**Failed payment.** Polar moves the subscription to `past_due`, emails the
customer and retries over 21 days. VISP keeps Plus through `past_due` and
shows one banner ("Payment failed. Update your card.") linking to the portal.
When Polar gives up the status becomes `canceled`, the state event arrives and
`plan` falls back to `free`: hosted features stop at the next entitlement
check, clips and backups are kept (highlights follow the existing
`brb_highlights_deleting` path only on explicit user delete). Cancel at period
end: Polar keeps the subscription `active` until `period_end`, then the same
event flips it. No VISP timer exists for any of this.

## 4. Dashboard and setup wizard

Minimum visible, detail behind expanders, as the rest of the dashboard.

- **One plan line** in the setup card: *Free · Upgrade to Plus* or *Plus ·
  renews 12 Nov*. The link opens Polar checkout or portal. Nothing else is
  added above the fold.
- **Usage** lives in a `DetailSection` "Plan and usage" on the Advanced tab:
  one bar per metered feature (used / quota, month resets on date). Collapsed
  by default.
- **Feature cards** keep their switches. Not entitled: the switch becomes a
  *Plus* tag with the upgrade link, in place, no modal. Quota exhausted: the
  card says "Monthly quota used, on-device until 1 Nov" and the switch stays
  on, because the fallback is what is running.
- **Past due**: a single banner at the top of the dashboard, nowhere else.
- **Setup wizard**: unchanged. Direct is free, so no step asks about money.
  The completion step gains one sentence: "Hosted voice, captions and
  highlights are part of Plus" with the upgrade link.
- **Native app / OBS plugin**: same *Plus* tag from `plan.me`, text "Manage
  your plan at visp-stream.com".
- **Landing and README**: "Free during beta" and the $0 bar become "Free" and
  "€9/mo for hosted extras"; the README line "does not bill users" goes.
- **Affiliate note wherever a price is shown.** One shared string, in
  `landing-copy.ts` and its app equivalents: *"Creators with an audience can
  apply to the Affiliate program and get every feature free.\*"*, linking to
  `/affiliate`, the asterisk reading "Plus quotas apply." The `/affiliate` page
  opens with the same standing offer under the same name, "Affiliate program"
  (also the footer label); the five founding creators are its current intake
  window, not a separate program. It sits under the
  landing cost chart and FAQ price answer, the dashboard plan line, every
  *Plus* tag's upgrade link, the usage expander, and the native app's plan
  screen. Checkout itself is Polar's page and cannot carry it, so the note is
  on the link that leads there.
- **Admin**: plan line and *Override* relabel from section 1; the Costs page
  gains a "Plus subscribers" count next to spend per streamer.

## 5. Implementation plan

**PR 1, entitlements and quotas (no money changes hands).** Schema columns;
`entitlement()` replacing `betterFeatures()` at every gate including
typography and OBS backup; `items` unit and typography metering; audio meter
quota re-check; `plan.me` without checkout URLs; dashboard plan line, usage
expander and *Plus* tags; admin relabel. Every existing user is `free` with
their overrides intact, so behaviour is unchanged until an admin or Polar sets
a plan. Tests: entitlement truth table, meter stop at zero.

**PR 2, Polar.** Auth plugin, webhook route, `applyCustomerState`, `syncPlans`
job, past-due banner, checkout and portal links in `plan.me`, landing and
README copy. Tests: webhook signature and replay, snapshot-to-plan mapping,
one subscribe-then-cancel round trip in the Polar sandbox.

**PR 3, clients.** Native app and OBS plugin *Plus* tags and "manage on web"
copy, Costs page subscriber count. Can ship after launch.

**Open, not blocking:** a trial (the state event already carries
`trialing`); annual pricing; moving `direct_dual_output` to Plus once encoder
minutes have a unit price.
