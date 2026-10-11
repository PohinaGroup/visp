import type { ReactNode } from "react";

/** The single `<h1>` every routed page starts with, so headings stay uniform. */
export function PageHeader({
	title,
	description,
	actions,
}: {
	title: string;
	description?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				{description && (
					<p className="text-muted-foreground text-sm">{description}</p>
				)}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}
