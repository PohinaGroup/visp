import { Card } from "@VISP/ui/components/card";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "./page-header";

/**
 * Placeholder for nav entries whose page has not been built yet. The route
 * exists so the shell, deep links, and nav can ship ahead of the data.
 */
export function ComingSoon({
	title,
	description,
	icon: Icon,
}: {
	title: string;
	description: string;
	icon: LucideIcon;
}) {
	return (
		<div className="grid gap-6">
			<PageHeader description={description} title={title} />
			<Card className="border border-border/60 border-dashed p-12 text-center">
				<Icon className="mx-auto mb-3 size-8 text-muted-foreground" />
				<p className="font-medium">Coming soon</p>
				<p className="mt-1 text-muted-foreground text-xs">
					This page is part of the admin console redesign and is not built yet.
				</p>
			</Card>
		</div>
	);
}
