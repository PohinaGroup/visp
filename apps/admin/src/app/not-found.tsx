import { buttonVariants } from "@VISP/ui/components/button";
import { Card } from "@VISP/ui/components/card";
import { Link } from "@tanstack/react-router";
import { MapPinOff } from "lucide-react";

export function NotFound() {
	return (
		<Card className="mx-auto mt-10 max-w-md border border-border/60 p-10 text-center">
			<MapPinOff className="mx-auto mb-3 size-8 text-muted-foreground" />
			<p className="font-medium">Page not found</p>
			<p className="mt-1 text-muted-foreground text-xs">
				This admin page does not exist.
			</p>
			<Link
				className={buttonVariants({
					className: "mt-4",
					size: "sm",
					variant: "outline",
				})}
				to="/"
			>
				Go to overview
			</Link>
		</Card>
	);
}
