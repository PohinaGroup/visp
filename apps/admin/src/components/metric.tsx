import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@VISP/ui/components/card";
import type { ReactNode } from "react";

export function Metric({
	icon,
	label,
	value,
	detail,
}: {
	icon: ReactNode;
	label: string;
	value: number;
	detail: string;
}) {
	return (
		<Card className="border border-border/60 bg-card/80">
			<CardHeader>
				<div className="flex items-center justify-between">
					<CardDescription className="font-medium uppercase tracking-wider">
						{label}
					</CardDescription>
					<span className="text-primary">{icon}</span>
				</div>
				<CardTitle className="font-mono text-3xl">{value}</CardTitle>
				<CardDescription>{detail}</CardDescription>
			</CardHeader>
		</Card>
	);
}
