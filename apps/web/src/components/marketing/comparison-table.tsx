type Row = { label: string; cells: readonly string[] };

/**
 * A real <table>, for crawlers and answer engines. Under 640px CSS
 * (`.mkt-table` in index.css) stacks each row, labelling cells from
 * `data-label`. Wider than two columns, it scrolls sideways from 640px up.
 */
export function ComparisonTable({
	caption,
	columns,
	rows,
}: {
	caption: string;
	columns: readonly string[];
	rows: readonly Row[];
}) {
	const wide = columns.length > 2;
	const table = (
		<table
			className={`w-full border-collapse text-left ${wide ? "sm:min-w-[52rem]" : ""}`}
		>
			<caption className="mb-5 text-left font-semibold text-[1.25rem] leading-snug">
				{caption}
			</caption>
			<thead>
				<tr>
					<td className={wide ? "w-[16%]" : "w-[30%]"} />
					{columns.map((column) => (
						<th
							key={column}
							scope="col"
							className="px-4 pb-3 align-bottom font-semibold leading-snug"
						>
							{column}
						</th>
					))}
				</tr>
			</thead>
			<tbody>
				{rows.map((row) => (
					<tr key={row.label} className="border-ink/15 border-t py-5 sm:py-0">
						<th
							scope="row"
							className="pb-3 font-semibold leading-snug sm:py-4 sm:pr-4 sm:align-top"
						>
							{row.label}
						</th>
						{row.cells.map((cell, i) => (
							<td
								key={columns[i]}
								data-label={columns[i]}
								className="py-2 leading-relaxed sm:px-4 sm:py-4 sm:align-top"
							>
								{cell}
							</td>
						))}
					</tr>
				))}
			</tbody>
		</table>
	);
	return (
		<div className="mkt-table rounded-xl bg-surface p-5 sm:p-8">
			{wide ? (
				// Focusable so keyboard users can scroll it. inline-size containment keeps
				// the table's min width from widening a grid or flex parent.
				<section
					// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region
					tabIndex={0}
					aria-label={caption}
					className="overflow-x-auto [contain:inline-size]"
				>
					{table}
				</section>
			) : (
				table
			)}
		</div>
	);
}
