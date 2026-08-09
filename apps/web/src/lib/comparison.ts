// The comparison matrix behind the landing "Free, and no PC at home" section
// and the llms.txt answer-engine summary, so a reader and an LLM see the same
// table. Prices are the vendors' public list prices on the checked date.
//
// Rows 4 and 5 are losses on purpose. blogs.md: "Comparisons should help
// readers choose the right workflow, including cases where another product is
// the better fit." A table VISP wins outright is a table nobody believes.

export const COMPARISON_CHECKED = "2026-08-09";

export const comparisonProducts = [
	"VISP",
	"IRLToolkit",
	"Streamable.run",
	"IRLServer",
	"BELABOX",
] as const;

type ComparisonRow = {
	label: string;
	/** One cell per entry in `comparisonProducts`, same order. */
	cells: readonly [string, string, string, string, string];
};

export const comparisonRows: readonly ComparisonRow[] = [
	{
		label: "Price",
		cells: [
			"Free during beta",
			"$129–179 / mo",
			"$120–180 / mo",
			"$10–20 / mo",
			"Hardware + your own server",
		],
	},
	{
		label: "Computer at home",
		cells: [
			"Not needed",
			"Not needed — cloud OBS",
			"Not needed — cloud OBS",
			"Required — you run OBS",
			"Required — you run OBS",
		],
	},
	{
		label: "Phone app included",
		cells: [
			"iOS, Android, browser",
			"Bring your own encoder",
			"Bring your own encoder",
			"Bring your own encoder",
			"Dedicated hardware encoder",
		],
	},
	{
		label: "Cellular bonding",
		cells: [
			"No — packet duplication only",
			"Yes — SRTLA ingest",
			"Yes — SRTLA ingest",
			"Yes — SRTLA ingest",
			"Yes — SRTLA, its own protocol",
		],
	},
	{
		label: "Scenes and overlays",
		cells: [
			"Your own OBS, optional",
			"Cloud OBS included",
			"Cloud OBS included",
			"Your own OBS",
			"Your own OBS",
		],
	},
	{
		label: "Source available",
		cells: [
			"GPL-2.0, self-hostable",
			"Closed",
			"Closed",
			"Closed",
			"Open source",
		],
	},
];

export const comparisonRowsFi: readonly ComparisonRow[] = [
	{
		label: "Hinta",
		cells: [
			"Ilmainen betan ajan",
			"129–179 $ / kk",
			"120–180 $ / kk",
			"10–20 $ / kk",
			"Laitteisto + oma palvelin",
		],
	},
	{
		label: "Kotikone",
		cells: [
			"Ei tarvita",
			"Ei tarvita — pilvi-OBS",
			"Ei tarvita — pilvi-OBS",
			"Tarvitaan — ajat OBS:n itse",
			"Tarvitaan — ajat OBS:n itse",
		],
	},
	{
		label: "Puhelinsovellus mukana",
		cells: [
			"iOS, Android, selain",
			"Oma encoder",
			"Oma encoder",
			"Oma encoder",
			"Oma laitteistoencoder",
		],
	},
	{
		label: "Mobiiliyhteyksien niputus",
		cells: [
			"Ei — vain pakettien monistus",
			"Kyllä — SRTLA",
			"Kyllä — SRTLA",
			"Kyllä — SRTLA",
			"Kyllä — SRTLA, oma protokolla",
		],
	},
	{
		label: "Kohtaukset ja grafiikat",
		cells: [
			"Oma OBS, valinnainen",
			"Pilvi-OBS mukana",
			"Pilvi-OBS mukana",
			"Oma OBS",
			"Oma OBS",
		],
	},
	{
		label: "Lähdekoodi",
		cells: [
			"GPL-2.0, itse ylläpidettävä",
			"Suljettu",
			"Suljettu",
			"Suljettu",
			"Avoin lähdekoodi",
		],
	},
];

/** Markdown table for llms.txt — answer engines cite what they can parse. */
export function comparisonMarkdown() {
	const header = `| | ${comparisonProducts.join(" | ")} |`;
	const divider = `| --- |${" --- |".repeat(comparisonProducts.length)}`;
	const body = comparisonRows
		.map((row) => `| ${row.label} | ${row.cells.join(" | ")} |`)
		.join("\n");
	return `${header}\n${divider}\n${body}`;
}
