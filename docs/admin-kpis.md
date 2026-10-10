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

**Live session.** `relay_stream_session` opens when the publisher connects
(`started_at`, `path-hooks.ts`) and closes on disconnect (`ended_at`).
`first_live_at` is set when a platform output first reports `live`
(`recordPlatformLive`, `packages/api/src/activation.ts`). A connected publisher
alone is not live.

```sql
-- live_session: sessions that reached live, owned by eligible users
select s.*, p.user_id, p.relay_id,
  coalesce(s.ended_at,
    case when ps.publishing and ps.last_event_at >= now() - interval '60 seconds'
         then now()
         else greatest(ps.last_event_at, s.first_live_at) end) as effective_end
from relay_stream_session s
join path p on p.id = s.path_id
left join path_state ps on ps.path_id = p.id
where s.first_live_at is not null
  and p.user_id in (select id from eligible_user)
```

**Edge cases that apply everywhere:**

- **Open sessions** (`ended_at is null`): still publishing (event within 60 s,
  as admin `isLive`) → count to `now()`; stale (missed hook, relay crash) → end
  at `path_state.last_event_at` so it doesn't grow forever.
- **Never reached live** (`first_live_at is null`): a failure in session
  success rate, 0 streaming hours, not WAS activity.
- **Revoked paths** keep their history: their sessions still count.
- **Relay attribution** uses the path's current `relay_id`, so a reassigned
  path moves its history with it.
- **Known gap: OBS-only streamers.** `first_live_at` is set only by Direct
  outputs (incl. custom and portrait, and native `reportFirstLiveActivation`,
  which also needs a live Direct output). Phone→OBS streamers never get it, so
  every live-based KPI undercounts them until an OBS streaming signal
  (`app_user.obs_streaming`) also sets it.

## KPIs

### 1. Weekly active streamers (WAS)
- **Plain:** how many different people went live this week.
- **SQL:** `count(distinct user_id)` from `live_session` where
  `first_live_at` falls in the week. One user with three devices counts once.
- **Bucketing:** ISO week of `first_live_at` (Sunday start, Monday live →
  Monday's week). **Shown on:** Overview (headline, 12-week trend), Growth.

### 2. Weekly streaming hours
- **Plain:** total hours VISP streams were live this week.
- **SQL:** `sum(extract(epoch from effective_end - first_live_at)) / 3600`
  from `live_session`. Time from `started_at` to `first_live_at` (connecting,
  not yet live) is excluded.
- **Bucketing:** the whole session goes to the week of `first_live_at`, never
  split, so past weeks stay stable. Open sessions keep growing: show the
  current week as "so far". **Shown on:** Overview (headline), Growth.

### 3. Sessions per active streamer
- **Plain:** how often an active streamer goes live in a week.
- **SQL:** `count(*) from live_session` in the week ÷ WAS. **Shown on:** Growth.

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

### 5. Signup → first-live rate (7-day window)
- **Plain:** share of a week's signups who went live within 7 days.
- **SQL:** cohort = eligible users by signup week. Numerator =
  `app_user.first_live_at < user.created_at + interval '7 days'`. Users with
  no `app_user` row count as not live.
- **Edge:** a cohort is shown only once its last member is at least 7 days old
  (cohort week start + 14 days ≤ now). Younger cohorts are greyed out as
  "maturing". Funnel alongside: signup → device created (any `path`, revoked
  or not) → first live → week-2 return. **Shown on:** Growth (funnel).

### 6. Time to first live (median hours)
- **Plain:** typical wait between signing up and first going live.
- **SQL:** `percentile_cont(0.5) within group (order by extract(epoch from
  a.first_live_at - (u.created_at at time zone 'UTC')) / 3600)` over users in
  the signup cohort who have gone live.
- **Edge:** right-censored (only users who went live), so always show it next
  to the 7-day rate. **Shown on:** Growth.

### 7. Week-2 return
- **Plain:** share of first-time streamers who go live again in week 2.
- **SQL:** F = `app_user.first_live_at`. Returned if a `live_session` for that
  user has `first_live_at` in `[F + 7 days, F + 14 days)`. The cohort is the
  ISO week of F.
- **Edge:** mature when cohort week start + 21 days ≤ now. F equals the
  user's earliest session `first_live_at`, because `recordPlatformLive` sets
  both in one transaction. **Shown on:** Growth (funnel), Retention.

### 8. Week-4 retention cohort
- **Plain:** share of a week's first-time streamers still live 4 weeks later.
- **SQL:** cohort W = ISO week of `app_user.first_live_at`. Retained if the
  user has a `live_session` whose ISO week is W + 4 weeks. Shown as a cohort
  grid (rows: W; columns: weeks 0–8; cells: % live that week).
- **Edge:** a cell is shown only once its week has ended. **Shown on:** Retention.

### 9. Session success rate
- **Plain:** the share of publisher connections that actually went live.
- **SQL:** sessions by ISO week of `started_at`:
  `count(*) filter (where first_live_at is not null) / count(*)`. Exclude open
  sessions with no `first_live_at` that started less than 10 minutes ago
  (still connecting).
- **Edge:** because of the OBS-only gap, every OBS-mode session counts as a
  failure. Until that's fixed, the denominator is limited to sessions on paths
  that currently have a Direct output configured (`path.direct_*`,
  `direct_destination`, `custom_direct_output`), labelled "Direct sessions".
  **Shown on:** Reliability.

### 10. Start-to-live p50 / p95
- **Plain:** time from connecting the phone to being live on the platform.
- **SQL:** `percentile_cont(0.5 | 0.95)` of
  `extract(epoch from first_live_at - started_at)` in seconds, over sessions
  with `first_live_at`, bucketed by `started_at`, split by `source_type`.
  **Shown on:** Reliability.

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
  live sessions can be rebuilt now from `relay_stream_session` intervals (a
  sweep over start and end events per relay). Peak forwarders needs T16 or T15.
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

## Legacy data

`relay_stream_session.first_live_at` and `app_user.first_live_at` were added in
migration `0014_safe_thing` (2026-09-06). Sessions and accounts that went live
before then have it null and look like "never reached live"; older activity
may only show in `path.publish_last_connected_at` (latest connection only).

### Legacy sessions (decided in T06)

TODO(T06): decide how sessions before `relay_stream_session` / `first_live_at`
existed (only `path.publish_last_connected_at` available) count towards WAS,
hours, activation and retention, and how dashboards mark that boundary.

## Data readiness

| KPI | Data source | Status |
| --- | --- | --- |
| WAS | `relay_stream_session.first_live_at`, `path` | partial (OBS-only gap, legacy T06) |
| Streaming hours | `relay_stream_session`, `path_state` | partial (OBS-only gap, legacy T06) |
| Sessions per active streamer | `relay_stream_session` | partial (same as WAS) |
| New signups by provider | `user`, `account.provider_id`, `app_user` onboarding enums | ready |
| Signup → first-live (7d) | `user`, `app_user.first_live_at` | partial (OBS-only gap) |
| Time to first live | `user`, `app_user.first_live_at` | partial (OBS-only gap) |
| Week-2 return | `app_user.first_live_at`, `relay_stream_session` | partial (OBS-only gap) |
| Week-4 retention | `app_user.first_live_at`, `relay_stream_session` | partial (OBS-only gap) |
| Session success rate | `relay_stream_session` | partial (Direct sessions only) |
| Start-to-live p50/p95 | `relay_stream_session` | ready |
| Relay RTT p50/p95 | `rtt_sample` | ready (setup probes only) |
| Peak relay utilisation | `relay`, `path`, `path_state`, `relay_health` | partial: current only; peaks need T16 `relay_health_sample`, T15 `forwarder_session` |
| Hosted spend per active streamer | — | needs new tracking: T13 `hosted_usage` |
| Direct encoder minutes | — | needs new tracking: T15 `forwarder_session` |
| Feature adoption | `app_user` flags, `chat_bot`, `multichat_overlay`, `agent`, Direct tables | partial: current state only; history needs T17 `daily_metrics` |

T17 `daily_metrics` also stores daily KPI rollups, so dashboards don't rescan
sessions on every load and history survives user deletion.
