# Admin dashboard KPIs

One source of truth for every number the admin dashboards show. If a dashboard
disagrees with this file, the dashboard is wrong: change the definition here
first, then the query. Schema: `packages/db/src/schema/relay.ts` and `auth.ts`.
Dashboard pages: **Overview**, **Growth**, **Retention**, **Reliability**,
**Relays**, **Costs**, **Features** (update "Shown on" if one is renamed).

## Headline

**Weekly active streamers (WAS)** and **weekly streaming hours**, side by side
at the top of Overview. Neither is shown alone: WAS hides engagement, and hours
hide concentration in a few heavy users.

## Shared conventions

**Time.** UTC; ISO weeks starting Monday 00:00 UTC:
`date_trunc('week', ts, 'UTC')` (`'day'` for daily views). `user.created_at`
and `account.created_at` are `timestamp` without time zone holding UTC: read
them as `created_at at time zone 'UTC'`. The current week is labelled partial.

**Eligible users.** Every KPI counts only eligible users:

```sql
-- eligible_user
select u.id from "user" u
where not ('admin' = any(string_to_array(u.role, ',')))
  and u.banned = false
  and u.id <> all(:admin_user_ids)  -- ADMIN_USER_IDS env, passed in by the API
```

- **Admins and test accounts** are excluded. There is no test flag, so test
  accounts must have the admin role or be in `ADMIN_USER_IDS`.
- **Banned users** are excluded from every week, past ones included (bans are
  mostly spam), so history can shift slightly after a ban.
- **Deleted users** disappear: `user` deletion cascades to `app_user`, `path`
  and `relay_stream_session`.

**Stream session.** `relay_stream_session` opens when the publisher connects
(`started_at`, `path-hooks.ts`) and closes on disconnect (`ended_at`). A
stream is a session that lasted at least **60 seconds**
(`MIN_STREAM_SECONDS`, `packages/api/src/routers/admin/metrics-sql.ts`).
Shorter sessions are reconnect blips: SRT reconnects open a new session each
time, and in October 2026 half of all sessions were under a minute (median
44 s). The threshold drops the blips; a long stream chopped into pieces still
adds up, because hours are summed and streamers are counted distinct.

```sql
-- stream_session: publisher sessions of at least 60 s, owned by eligible users
select * from (
  select s.*, p.user_id, p.relay_id,
    coalesce(s.ended_at,
      case when ps.publishing and ps.last_event_at >= now() - interval '60 seconds'
           then now()
           else greatest(ps.last_event_at, s.started_at) end) as effective_end
  from relay_stream_session s
  join path p on p.id = s.path_id
  left join path_state ps on ps.path_id = p.id
  where p.user_id in (select id from eligible_user)
) s
where s.effective_end - s.started_at >= interval '60 seconds'
```

```sql
-- first_stream: F, each user's first stream
select user_id, min(started_at) as first_streamed_at
from stream_session group by user_id
```

**Edge cases that apply everywhere:**

- **Open sessions** (`ended_at is null`): still publishing (event within 60 s,
  as admin `isLive`) → count to `now()`; stale (missed hook, relay crash) → end
  at `path_state.last_event_at` so it doesn't grow forever.
- **Blips** (under 60 s): not a stream, not a streamer, 0 hours. They only
  appear in KPI 9 as the unstable share.
- **Revoked paths** keep their history: their sessions still count.
- **Relay attribution** uses the path's current `relay_id`, so a reassigned
  path moves its history with it.
- **`first_live_at` is not a KPI input.** See "Why not platform live" below.

## KPIs

### 1. Weekly active streamers (WAS)
- **Plain:** how many different people streamed this week.
- **SQL:** `count(distinct user_id)` from `stream_session` where `started_at`
  falls in the week. One user with three devices counts once.
- **Bucketing:** ISO week of `started_at` (Sunday start, Monday live →
  Monday's week). **Shown on:** Overview (headline, 12-week trend), Growth.

### 2. Weekly streaming hours
- **Plain:** total hours VISP publishers were connected this week.
- **SQL:** `sum(extract(epoch from effective_end - started_at)) / 3600` from
  `stream_session`.
- **Bucketing:** the whole session goes to the week of `started_at`, never
  split, so past weeks stay stable. Open sessions keep growing: show the
  current week as "so far". **Shown on:** Overview (headline), Growth.

### 3. Sessions per active streamer
- **Plain:** how often an active streamer streams in a week.
- **SQL:** `count(*) from stream_session` in the week ÷ WAS. **Shown on:** Growth.

### 4. New signups (by auth provider)
- **Plain:** accounts created this week, split by how they signed up.
- **SQL:** eligible `user` rows by ISO week of `created_at at time zone 'UTC'`.
  The provider is the `account.provider_id` of the user's earliest `account`
  row (`credential` = email and password, `google`, `twitch`, `apple`,
  `kick`). Later linked accounts don't count as the signup provider. A user
  with no `account` row is shown as `unknown`.
- **Breakdowns:** onboarding answers from `app_user.streaming_software`,
  `setup_use_case` and `stream_destination`. Null means "skipped / not
  onboarded" (`onboarded_at is null`).
- **Edge:** unverified email signups are included and also counted separately.
  **Shown on:** Growth.

### 5. Signup → first-stream rate (7-day window)
- **Plain:** share of a week's signups who streamed within 7 days.
- **SQL:** cohort = eligible users by signup week. Numerator =
  `first_stream.first_streamed_at < user.created_at + interval '7 days'`.
  Users with no stream count as not converted.
- **Edge:** a cohort is shown only once its last member is at least 7 days old
  (cohort week start + 14 days ≤ now). Younger cohorts are greyed out as
  "maturing". Funnel alongside: signup → device created (any `path`, revoked
  or not) → first stream → week-2 return. The API keeps the historical
  `signup_to_first_live_rate` / `first_live` keys. **Shown on:** Growth
  (funnel), Overview (tile).

### 6. Time to first stream (median hours)
- **Plain:** typical wait between signing up and the first stream.
- **SQL:** `percentile_cont(0.5) within group (order by extract(epoch from
  fs.first_streamed_at - (u.created_at at time zone 'UTC')) / 3600)` over
  users in the signup cohort who have streamed.
- **Edge:** right-censored (only users who streamed), so always show it next
  to the 7-day rate. **Shown on:** Growth.

### 7. Week-2 return
- **Plain:** share of first-time streamers who stream again in week 2.
- **SQL:** F = `first_stream.first_streamed_at`. Returned if a
  `stream_session` for that user has `started_at` in
  `[F + 7 days, F + 14 days)`. The cohort is the ISO week of F.
- **Edge:** mature when cohort week start + 21 days ≤ now. **Shown on:** Growth
  (funnel), Retention.

### 8. Week-4 retention cohort
- **Plain:** share of a week's first-time streamers still streaming 4 weeks
  later.
- **SQL:** cohort W = ISO week of F. Retained if the user has a
  `stream_session` whose ISO week is W + 4 weeks. Shown as a cohort grid
  (rows: W; columns: weeks 0–8; cells: % streaming that week).
- **Edge:** a cell is shown only once its week has ended. **Shown on:** Retention.

### 9. Stable-session rate
- **Plain:** the share of publisher connections that lasted at least a minute,
  i.e. were not reconnect blips. A connection-stability number, not a
  "reached the platform" number.
- **SQL:** all eligible sessions by ISO week of `started_at`:
  `count(*) filter (where effective_end - started_at >= interval '60 seconds')
  / count(*)`. Open sessions younger than 60 s are still connecting and left
  out.
- **Edge:** the API procedure is still called `admin.reliability.sessionSuccess`
  and the alert rule `session_success`; fields are `started`, `stable`,
  `stableRate`. **Shown on:** Reliability, Overview (needs-attention alert,
  rule 4).

### 10. Start-to-live p50 / p95 — *dropped*
- Measured `first_live_at - started_at`, which only Direct outputs reported.
  No session has ever recorded `first_live_at` in production (checked
  2026-10-14), so there was nothing to show. Reinstate from
  `forwarder_session` if Direct latency becomes a question.

### 11. Relay RTT p50 / p95
- **Plain:** typical and worst-case streamer→relay round-trip time.
- **SQL:** `percentile_cont(0.5 | 0.95)` of `rtt_sample.rtt_ms` per
  `relay_id`, bucketed by `created_at` (day or week), eligible users only.
  Rows with `relay_id is null` are excluded.
- **Edge:** these are client probes (`browser-probe`, `manual`) taken at
  setup, not in-stream link RTT. `path_state.link_rtt_ms` is the live link but
  only holds the latest value. Heavy probers count more; to avoid that, take
  the per-user median first, then percentiles across users.
  **Shown on:** Relays, Reliability.

### 12. Peak relay utilisation
- **Plain:** how close each relay got to its configured limits.
- **SQL (now):** paths = `count(path where relay_id = r.id and revoked_at is
  null) / relay.capacity_paths`. Forwarders = occupied Direct outputs (states
  `starting`, `live`, `retrying`, `brb`, `stopping`, or an unexpired
  reservation) across `path_state.direct_*`, `direct_destination` and
  `custom_direct_output` / `relay.max_forwarders`. This is the same count the
  admission code in `direct-custom.ts` uses. Concurrent publishers =
  `path_state.publishing = true` on that relay.
- **Peak:** the daily or weekly maximum needs a time series. Peak concurrent
  sessions can be rebuilt now from `relay_stream_session` intervals (a sweep
  over start and end events per relay). Peak forwarders needs T16 or T15.
  Host load (`relay_health.load*`, memory, disk) only has the latest sample.
- **Edge:** drained or disabled relays are shown but left out of fleet totals.
  `max_forwarders = 0` shows "n/a". **Shown on:** Relays.

### 13. Hosted spend per active streamer *(pending T13)*
- **Plain:** what hosted features (TTS, audio isolation, subtitles, Direct
  encode) cost us per active streamer.
- **SQL:** `sum(hosted_usage cost)` in the week ÷ WAS; columns and units come
  from T13. Also split per feature, plus the top 10 spenders (handles only).
  **Shown on:** Costs.

### 14. Direct encoder minutes *(pending T15)*
- **Plain:** server-side encode minutes spent on Direct outputs.
- **SQL:** `sum(ended_at − started_at)` in minutes from T15
  `forwarder_session`, split by provider and role, bucketed by start week.
  **Shown on:** Costs, Relays.

### 15. Feature adoption
- **Plain:** the share of this week's active streamers who use each feature.
- **SQL:** for each WAS user, the current flags: `app_user.brb_enabled`,
  `brb_highlights`, `better_tts`, `better_audio_isolation`, `better_subtitles`,
  `direct_dual_output`, `direct_production_mode = 'cloud_studio'`; OBS plugin =
  `obs_last_seen_at` within the week; Direct = any `path.direct_*`,
  `direct_destination` or `custom_direct_output`; chat bot =
  `chat_bot.enabled`; multichat = a `multichat_overlay` row; agents = any
  `agent` row. Divide by WAS.
- **Edge:** flags are current state, so past weeks show today's flags until
  T17 `daily_metrics` snapshots exist. **Shown on:** Features.

## Data start

`METRICS_DATA_START = 2026-07-27T00:00:00Z`, defined once in
`packages/api/src/routers/admin/metrics-window.ts`: the Monday of the week
migration 0000 created `relay_stream_session` (2026-07-29). Every publisher
session there is counts, so there is no legacy rule for sessions.

**How dashboards show it.**
- Session-based queries clamp the range start to
  `greatest(:from, METRICS_DATA_START)` and don't draw zero weeks before it
  (no data, not zero activity).
- When the requested range starts earlier, the chart shows the note
  **"Data starts Jul 27, 2026"**.
- A KPI tile whose comparison period starts before it shows no delta.
- Signups (KPI 4) and the signup → device stage have no clamp either way.

**"Ever streamed" counts.** The admin user list's `everStreamed` and
`lastStreamedAt` (`hasStreamed` in `packages/api/src/routers/admin.ts`) use
`path.publish_last_connected_at` or any `relay_stream_session` row, blips
included. They are lifetime facts, labelled "ever connected", never trends.

## Why not platform live

`relay_stream_session.first_live_at` and `app_user.first_live_at` (migration
`0014_safe_thing`, 2026-09-06) record when a platform output first reported
`live`. The KPIs were first defined on them, and that was wrong for this
product:

- Only `recordPlatformLive` (`packages/api/src/activation.ts`) sets them, from
  Direct output state (`direct.ts`, `direct-custom.ts`,
  `reportFirstLiveActivation`) and, since 2026-10-14, the OBS plugin's
  streaming report (`reportObsControlState` in `obs-control.ts`, for each of
  the user's open sessions). Most streamers pull the relay into OBS, vMix or
  similar without the plugin and have no Direct output, so they never produce
  the signal at all.
- Checked on 2026-10-14: 0 sessions ever had `first_live_at`; 19 eligible
  people had streamed in the previous 28 days. The one Direct live on record
  arrived between two reconnects and matched no open session.

So every live-based number was computed over an empty set. The columns stay
(Direct and the OBS plugin still write them) but no KPI reads them. If a
"reached the platform" metric is wanted later, build it from
`forwarder_session` and label it Direct-only.

`daily_metrics` rows computed under the old definition were deleted by
migration `0034_stream_session_kpis`; the nightly job backfills them.

## Data readiness

| KPI | Data source | Status |
| --- | --- | --- |
| WAS | `relay_stream_session`, `path`, `path_state` | ready (from Jul 27, 2026) |
| Streaming hours | `relay_stream_session`, `path_state` | ready (from Jul 27, 2026) |
| Sessions per active streamer | `relay_stream_session` | ready (from Jul 27, 2026) |
| New signups by provider | `user`, `account.provider_id`, `app_user` onboarding enums | ready |
| Signup → first stream (7d) | `user`, `relay_stream_session` | ready |
| Time to first stream | `user`, `relay_stream_session` | ready |
| Week-2 return | `relay_stream_session` | ready |
| Week-4 retention | `relay_stream_session` | ready |
| Stable-session rate | `relay_stream_session`, `path_state` | ready |
| Start-to-live p50/p95 | — | dropped (see KPI 10) |
| Relay RTT p50/p95 | `rtt_sample` | ready (setup probes only) |
| Peak relay utilisation | `relay`, `path`, `path_state`, `relay_health` | partial: current only; peaks need T16 `relay_health_sample`, T15 `forwarder_session` |
| Hosted spend per active streamer | — | needs new tracking: T13 `hosted_usage` |
| Direct encoder minutes | — | needs new tracking: T15 `forwarder_session` |
| Feature adoption | `app_user` flags, `chat_bot`, `multichat_overlay`, `agent`, Direct tables | partial: current state only; history needs T17 `daily_metrics` |

T17 `daily_metrics` also stores daily KPI rollups, so dashboards don't rescan
sessions on every load and history survives user deletion.
