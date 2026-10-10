import { ScrollText } from "lucide-react";
import { ComingSoon } from "../components/coming-soon";

export function AuditPage() {
	return (
		<ComingSoon
			description="Who changed what, when, across admin actions."
			icon={ScrollText}
			title="Audit log"
		/>
	);
}
