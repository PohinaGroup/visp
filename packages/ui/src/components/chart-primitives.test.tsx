import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	BarSeriesChart,
	HorizontalBarChart,
	isChartDataEmpty,
	TrendLineChart,
} from "./charts";
import { KpiTile } from "./kpi-tile";

/**
 * Static-markup smoke tests: no DOM is available under bun:test, so these
 * cover the branches that do not depend on layout (loading, empty, tile
 * semantics). Plot rendering is verified by the admin Vite build.
 */

type Row = { day: string; hours: number | null; sessions?: number };
const series = [{ key: "hours", label: "Streaming hours" }] as const;

describe("isChartDataEmpty", () => {
	test("no rows or only null values are empty", () => {
		expect(isChartDataEmpty<Row>([], [...series])).toBe(true);
		expect(isChartDataEmpty<Row>(undefined, [...series])).toBe(true);
		expect(
			isChartDataEmpty<Row>([{ day: "Mon", hours: null }], [...series]),
		).toBe(true);
		expect(isChartDataEmpty<Row>([{ day: "Mon", hours: 0 }], [...series])).toBe(
			false,
		);
	});
});

describe("chart wrappers", () => {
	test("render an empty state with the accessible name", () => {
		const html = renderToStaticMarkup(
			<TrendLineChart<Row>
				data={[]}
				series={[...series]}
				xKey="day"
				ariaLabel="Streaming hours per day"
				emptyMessage="No sessions yet"
			/>,
		);
		expect(html).toContain('aria-label="Streaming hours per day"');
		expect(html).toContain('data-state="empty"');
		expect(html).toContain("No sessions yet");
	});

	test("render a busy skeleton while loading", () => {
		for (const html of [
			renderToStaticMarkup(
				<BarSeriesChart<Row>
					data={undefined}
					series={[...series]}
					xKey="day"
					ariaLabel="Hours"
					loading
				/>,
			),
			renderToStaticMarkup(
				<HorizontalBarChart<Row>
					data={undefined}
					series={[...series]}
					categoryKey="day"
					ariaLabel="Hours"
					loading
				/>,
			),
		]) {
			expect(html).toContain('aria-busy="true"');
			expect(html).toContain('data-state="loading"');
		}
	});

	test("ready state includes a screen-reader table with Intl values", () => {
		const html = renderToStaticMarkup(
			<BarSeriesChart<Row>
				data={[
					{ day: "Mon", hours: 1284 },
					{ day: "Tue", hours: null },
				]}
				series={[...series]}
				xKey="day"
				categoryLabel="Day"
				ariaLabel="Hours"
				locale="en-US"
			/>,
		);
		expect(html).toContain('data-state="ready"');
		expect(html).toContain('<th scope="col">Day</th>');
		expect(html).toContain("1,284");
		expect(html).toContain("—");
	});
});

describe("KpiTile", () => {
	test("derives delta from previous and marks tone", () => {
		const html = renderToStaticMarkup(
			<KpiTile
				label="Streaming hours"
				value={110}
				previous={100}
				locale="en-US"
			/>,
		);
		expect(html).toContain("+10%");
		expect(html).toContain('data-tone="good"');
		expect(html).toContain("up 10% vs previous period, good");
	});

	test("invert turns an increase bad", () => {
		const html = renderToStaticMarkup(
			<KpiTile
				label="Relay cost"
				value={120}
				deltaPct={20}
				invert
				locale="en-US"
			/>,
		);
		expect(html).toContain('data-tone="bad"');
		expect(html).toContain("text-destructive");
	});

	test("renders as a link or button when interactive", () => {
		expect(
			renderToStaticMarkup(<KpiTile label="WAS" value={5} href="/streamers" />),
		).toStartWith("<a ");
		expect(
			renderToStaticMarkup(
				<KpiTile label="WAS" value={5} onClick={() => {}} />,
			),
		).toStartWith('<button type="button"');
	});

	test("shows a sparkline, missing value and loading states", () => {
		expect(
			renderToStaticMarkup(
				<KpiTile label="WAS" value={5} sparkline={[1, 2, 3]} />,
			),
		).toContain('data-slot="kpi-sparkline"');
		const missing = renderToStaticMarkup(<KpiTile label="WAS" value={null} />);
		expect(missing).toContain("—");
		expect(missing).toContain("No comparison");
		expect(
			renderToStaticMarkup(<KpiTile label="WAS" value={5} loading />),
		).toContain('aria-busy="true"');
	});
});
