import { AuthProvider } from "@better-auth-ui/react";
import { useRouter } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { agentClient, agentAuthAdapter } from "@/lib/auth-client";
import { agentAuthPlugin } from "@/lib/auth/agent-auth-plugin";
import { useLocale } from "@/lib/i18n";
import { agentFinnishLocale } from "@/lib/auth/agent-locale";

export function AgentProvider({ children }: { children: ReactNode }) {
	const router = useRouter();
	const fi = useLocale() === "fi";
	const plugins = useMemo(() => [agentAuthPlugin({ adapter: agentAuthAdapter })], []);
	return <AuthProvider authClient={agentClient} plugins={plugins}
		locale={fi ? agentFinnishLocale : undefined}
		localization={fi ? { settings: { cancel: "Peruuta" } } : undefined}
		navigate={({ to, replace }) => { void router.navigate({ href: to, replace }); }}>
		<div data-rybbit-block>{children}</div>
	</AuthProvider>;
}
