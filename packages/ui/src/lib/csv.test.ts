import { describe, expect, test } from "bun:test";
import { CSV_BOM, downloadCsv, escapeCsvField, toCsv } from "./csv";

describe("escapeCsvField", () => {
	test("quotes fields with comma, quote or line breaks and doubles quotes", () => {
		expect(escapeCsvField("plain")).toBe("plain");
		expect(escapeCsvField("a,b")).toBe('"a,b"');
		expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
		expect(escapeCsvField("line\nbreak")).toBe('"line\nbreak"');
		expect(escapeCsvField("cr\rlf")).toBe('"cr\rlf"');
	});

	test("serialises non-string values", () => {
		expect(escapeCsvField(null)).toBe("");
		expect(escapeCsvField(undefined)).toBe("");
		expect(escapeCsvField(1284.5)).toBe("1284.5");
		expect(escapeCsvField(Number.NaN)).toBe("");
		expect(escapeCsvField(true)).toBe("true");
		expect(escapeCsvField(new Date("2026-10-01T00:00:00Z"))).toBe(
			"2026-10-01T00:00:00.000Z",
		);
	});

	test("guards string cells that a spreadsheet would run as a formula", () => {
		expect(escapeCsvField("=1+1")).toBe("'=1+1");
		expect(escapeCsvField("+SUM(A1)")).toBe("'+SUM(A1)");
		expect(escapeCsvField("-2+3")).toBe("'-2+3");
		expect(escapeCsvField("@cmd")).toBe("'@cmd");
		expect(escapeCsvField("\t=x")).toBe("'\t=x");
		expect(escapeCsvField("\r=x")).toBe('"\'\r=x"');
		expect(escapeCsvField('=HYPERLINK("x","y")')).toBe(
			'"\'=HYPERLINK(""x"",""y"")"',
		);
	});

	test("leaves real numbers numeric and can be switched off", () => {
		expect(escapeCsvField(-3)).toBe("-3");
		expect(escapeCsvField("a=b")).toBe("a=b");
		expect(escapeCsvField("=1+1", false)).toBe("=1+1");
	});
});

describe("toCsv", () => {
	type Row = { day: string; hours: number | null; title?: string };
	const rows: Row[] = [
		{ day: "2026-10-01", hours: 12, title: "Hello, world" },
		{ day: "2026-10-02", hours: null, title: "=evil()" },
	];

	test("writes headers and CRLF-separated records", () => {
		expect(
			toCsv(rows, [
				{ key: "day", header: "Day" },
				{ key: "hours", header: "Streaming hours" },
				{ key: "title" },
			]),
		).toBe(
			[
				"Day,Streaming hours,title",
				'2026-10-01,12,"Hello, world"',
				"2026-10-02,,'=evil()",
			].join("\r\n"),
		);
	});

	test("supports derived columns", () => {
		expect(
			toCsv(rows, [
				{ key: "hours", header: "Minutes", value: (r) => (r.hours ?? 0) * 60 },
			]),
		).toBe("Minutes\r\n720\r\n0");
	});

	test("optionally prepends a UTF-8 BOM for Excel", () => {
		const csv = toCsv([{ name: "Äänekoski" }], [{ key: "name" }], {
			bom: true,
		});
		expect(csv.startsWith(CSV_BOM)).toBe(true);
		expect(csv.charCodeAt(0)).toBe(0xfeff);
		expect(csv.slice(1)).toBe("name\r\nÄänekoski");
		expect(toCsv([], [{ key: "name" }]).startsWith(CSV_BOM)).toBe(false);
	});
});

describe("downloadCsv", () => {
	test("is a no-op without a DOM", () => {
		expect(() => downloadCsv("x", "a,b")).not.toThrow();
	});
});
