-- Data-only. The admin KPIs now count publisher sessions of at least 60 s by
-- `started_at` instead of sessions that reported `first_live_at`
-- (docs/admin-kpis.md, "Stream session"). Every stored daily rollup was
-- computed under the old definition; emptying the table makes the next
-- nightly run backfill history from the first signup (`runDailyMetricsJob`).
DELETE FROM "daily_metrics";
