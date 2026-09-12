import { useState } from "react";
import { Field, FieldGroup, FieldLabel } from "@VISP/ui/components/field";
import { Input } from "@VISP/ui/components/input";
import { Button } from "@VISP/ui/components/button";
import { agentClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n";
import { AgentAuthorizations } from "./agent-authorizations";
import { AgentProvider } from "./agent-provider";

export function AgentsCard() {
	const fi = useLocale() === "fi";
	const [pending, setPending] = useState(false);
	const [error, setError] = useState(false);
	const [enrollment, setEnrollment] = useState<{ hostId: string; token: string; expiresAt: string }>();
	async function enroll() {
		setPending(true);
		setError(false);
		try {
			const result = await agentClient.host.create({ name: "VISP agent host", default_capabilities: [] });
			if (result.error || !result.data?.enrollmentToken) throw new Error("Enrollment failed");
			setEnrollment({ hostId: result.data.hostId, token: result.data.enrollmentToken, expiresAt: new Date(result.data.enrollmentTokenExpiresAt!).toLocaleString() });
		} catch { setError(true); }
		finally { setPending(false); }
	}
	return <AgentProvider>
		<section id="dashboard-agents" className="flex flex-col gap-4" aria-label={fi ? "Agenttien käyttöoikeudet" : "Agent access"}>
			<AgentAuthorizations />
			{error && <p role="alert">{fi ? "Yhdistämiskoodia ei voitu luoda. Yritä uudelleen." : "Could not create an enrollment code. Try again."}</p>}
			{enrollment ? <div className="flex flex-col gap-2">
				<p>{fi ? "Anna nämä tiedot agenttisi yhdistämistoimintoon. Hyväksyt käyttöoikeudet erikseen." : "Enter these details in your agent's enrollment flow. You will approve capabilities separately."}</p>
				<p>{fi ? "Vanhenee" : "Expires"} {enrollment.expiresAt}</p>
                <FieldGroup><Field><FieldLabel htmlFor="agent-host-id">{fi ? "Palvelimen tunniste" : "Host ID"}</FieldLabel><Input id="agent-host-id" readOnly value={enrollment.hostId} /></Field>
				<Field><FieldLabel htmlFor="agent-enrollment-token">{fi ? "Yhdistämiskoodi" : "Enrollment code"}</FieldLabel><Input id="agent-enrollment-token" readOnly value={enrollment.token} /></Field></FieldGroup>
				<Button variant="outline" onClick={() => setEnrollment(undefined)}>{fi ? "Sulje" : "Dismiss"}</Button>
			</div> : <Button variant="outline" disabled={pending} onClick={() => void enroll()}>{fi ? "Yhdistä agentti" : "Connect an agent"}</Button>}
		</section>
	</AgentProvider>;
}
