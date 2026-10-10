import { DollarSign } from "lucide-react";
import { ComingSoon } from "../components/coming-soon";

export function UsagePage() {
	return (
		<ComingSoon
			description="Streaming hours, hosted feature usage, and spend."
			icon={DollarSign}
			title="Usage and cost"
		/>
	);
}
