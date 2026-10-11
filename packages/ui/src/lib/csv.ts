/**
 * Minimal RFC 4180 CSV writer for "export what you see" buttons.
 *
 * Kept dependency-free and pure (except {@link downloadCsv}) so it can be
 * unit-tested under bun:test and reused by any table or chart.
 */

/** One output column. `header` defaults to `key`. */
export type CsvColumn<T> = {
	key: Extract<keyof T, string>;
	header?: string;
	/** Derive the cell from the whole row instead of reading `row[key]`. */
	value?: (row: T) => unknown;
};

export type ToCsvOptions = {
	/**
	 * Prepend a UTF-8 byte-order mark. Excel only detects UTF-8 in a CSV when
	 * the BOM is present; without it non-ASCII names (ä, ö, emoji) are shown as
	 * mojibake. Other tools ignore or strip it. Default false.
	 */
	bom?: boolean;
	/** Neutralise spreadsheet formulas (default true, see {@link escapeCsvField}). */
	formulaGuard?: boolean;
};

export const CSV_BOM = "﻿";
const CRLF = "\r\n";

/**
 * Characters that make Excel, LibreOffice and Google Sheets treat a cell as a
 * formula (or, for TAB/CR, that they strip before doing so).
 */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

function cellText(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "number")
		return Number.isFinite(value) ? String(value) : "";
	if (value instanceof Date)
		return Number.isNaN(value.getTime()) ? "" : value.toISOString();
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}

/**
 * Serialise one field.
 *
 * Formula-injection guard: exported cells can contain user-controlled text
 * (stream titles, display names, platform names). A cell such as
 * `=HYPERLINK("https://evil", "click")` or `@SUM(...)` would be evaluated
 * when an admin opens the file in a spreadsheet (CSV/formula injection,
 * OWASP). Prefixing `'` makes the spreadsheet show the text literally. Only
 * *strings* are guarded: real numbers like `-3` stay numeric so exported
 * series can still be charted and summed.
 */
export function escapeCsvField(value: unknown, formulaGuard = true): string {
	let text = cellText(value);
	if (formulaGuard && typeof value === "string" && FORMULA_TRIGGER.test(text)) {
		text = `'${text}`;
	}
	return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Header row plus one record per row, CRLF-separated as RFC 4180 specifies
 * (no trailing line break, which the RFC makes optional).
 */
export function toCsv<T>(
	rows: readonly T[],
	columns: readonly CsvColumn<T>[],
	options: ToCsvOptions = {},
): string {
	const { bom = false, formulaGuard = true } = options;
	const line = (cells: readonly unknown[]) =>
		cells.map((cell) => escapeCsvField(cell, formulaGuard)).join(",");
	const header = line(columns.map((column) => column.header ?? column.key));
	const records = rows.map((row) =>
		line(
			columns.map((column) =>
				column.value
					? column.value(row)
					: (row as Record<string, unknown>)[column.key],
			),
		),
	);
	return (bom ? CSV_BOM : "") + [header, ...records].join(CRLF);
}

/**
 * Save `csv` as a file via a temporary object URL. No-op during SSR or in
 * tests (no `document`). `.csv` is appended when missing so the OS picks
 * the right app.
 */
export function downloadCsv(filename: string, csv: string): void {
	if (typeof document === "undefined" || typeof URL === "undefined") return;
	const name = /\.csv$/i.test(filename) ? filename : `${filename}.csv`;
	const url = URL.createObjectURL(
		new Blob([csv], { type: "text/csv;charset=utf-8" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.rel = "noopener";
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	link.remove();
	// Revoke on the next task: some browsers start the download
	// asynchronously and would fail on an already-revoked URL.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
