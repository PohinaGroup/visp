import { CSV_BOM } from "@VISP/ui/lib/csv";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	BarSeriesChart,
	chartToCsv,
	HorizontalBarChart,
	TrendLineChart,
} from "./charts";

type Row = { day: string; hours: number | null; sessions: number };
const data: Row[] = [
	{ day: "2026-10-01", hours: 1284.5, sessions: 3 },
	{ day: "2026-10-02", hours: null, sessions: 0 },
];
const series = [
	{ key: "hours", label: "Streaming hours" },
	{ key: "sessions", label: "Sessions, started" },
] as const;

describe("chartToCsv", () => {
	test("exports the plotted rows with series labels as headers", () => {
		expect(
			chartToCsv<Row>({
				data,
				series: [...series],
				labelKey: "day",
				categoryLabel: "Day",
			}),
		).toBe(
			`${CSV_BOM}Day,Streaming hours,"Sessions, started"\r\n2026-10-01,1284.5,3\r\n2026-10-02,,0`,
		);
	});

	test("falls back to the key and honours an override", () => {
		expect(
			chartToCsv<Row>({ data, series: [series[0]], labelKey: "day" }),
		).toStartWith(`${CSV_BOM}day,Streaming hours\r\n`);
		expect(
			chartToCsv<Row>({
				data,
				series: [...series],
				labelKey: "day",
				exportColumns: [{ key: "sessions", header: "n" }],
			}),
		).toBe(`${CSV_BOM}n\r\n3\r\n0`);
	});
});

describe("export button", () => {
	const label = 'aria-label="Download CSV: Hours"';

	test("renders only when exportFilename is set", () => {
		const charts = (exportFilename?: string) => [
			renderToStaticMarkup(
				<TrendLineChart<Row>
					data={data}
					series={[...series]}
					xKey="day"
					ariaLabel="Hours"
					exportFilename={exportFilename}
				/>,
			),
			renderToStaticMarkup(
				<BarSeriesChart<Row>
					data={data}
					series={[...series]}
					xKey="day"
					ariaLabel="Hours"
					exportFilename={exportFilename}
				/>,
			),
			renderToStaticMarkup(
				<HorizontalBarChart<Row>
					data={data}
					series={[...series]}
					categoryKey="day"
					ariaLabel="Hours"
					exportFilename={exportFilename}
				/>,
			),
		];
		for (const html of charts()) {
			expect(html).toContain('data-state="ready"');
			expect(html).not.toContain(label);
			expect(html).not.toContain('data-slot="chart-toolbar"');
		}
		for (const html of charts("streaming-hours")) {
			expect(html).toContain(label);
			expect(html).toContain('title="Download CSV"');
			expect(html).toContain("lucide-download");
		}
	});

	test("is hidden while loading or empty", () => {
		for (const html of [
			renderToStaticMarkup(
				<TrendLineChart<Row>
					data={undefined}
					series={[...series]}
					xKey="day"
					ariaLabel="Hours"
					loading
					exportFilename="hours"
				/>,
			),
			renderToStaticMarkup(
				<BarSeriesChart<Row>
					data={[]}
					series={[...series]}
					xKey="day"
					ariaLabel="Hours"
					exportFilename="hours"
				/>,
			),
		]) {
			expect(html).not.toContain(label);
		}
	});
});
