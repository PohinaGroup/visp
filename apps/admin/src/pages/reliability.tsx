import { Activity } from "lucide-react";
import { ComingSoon } from "../components/coming-soon";

export function ReliabilityPage() {
	return (
		<ComingSoon
			description="Session success, start-to-live latency, and relay incidents."
			icon={Activity}
			title="Reliability"
		/>
	);
}
