/**
 * First instant the KPIs are computed from: the Monday of the week
 * `relay_stream_session` was created (migration 0000, 2026-07-29), so every
 * publisher session there is counts. Earlier ranges have no data, not zero;
 * see docs/admin-kpis.md, "Data start".
 */
export const METRICS_DATA_START = new Date("2026-07-27T00:00:00Z");
