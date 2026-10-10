/**
 * First instant from which `relay_stream_session.first_live_at` is recorded
 * (migration 0014). Live-based KPIs are not computed before it; see
 * docs/admin-kpis.md, "Legacy sessions".
 */
export const METRICS_DATA_START = new Date("2026-09-07T00:00:00Z");
