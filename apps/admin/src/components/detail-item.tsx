import type { ReactNode } from "react";

/** One label/value row inside a `<dl>`; the last row drops its divider. */
export function DetailItem({
	label,
	value,
}: {
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="grid grid-cols-[9rem_1fr] gap-3 border-border/60 border-b py-2 last:border-0">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words text-right">{value}</dd>
		</div>
	);
}
