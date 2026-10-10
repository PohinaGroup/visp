import type { ApiRange } from "../app/date-range";

/**
 * Placeholders for Overview panels other tasks build. The Overview page
 * already renders each one in its final position with the date range it will
 * need, so filling a slot means editing only this file, never
 * `pages/overview.tsx`. Each renders nothing until then, so the page shows no
 * empty boxes.
 */
export type OverviewSlotProps = {
	/** The dashboard range as `toApiRange(useDateRange())` returns it. */
	range: ApiRange;
};

/**
 * SLOT (T23): "Needs attention" panel (failing relays, error spikes, spend
 * over budget). Rendered in the lower row, next to the spend tile.
 */
export function OverviewAttention(_props: OverviewSlotProps) {
	return null;
}

/**
 * SLOT (T22): hosted-spend tile (spend in range vs budget). Rendered in the
 * lower row, next to "Needs attention".
 */
export function OverviewSpendTile(_props: OverviewSlotProps) {
	return null;
}
