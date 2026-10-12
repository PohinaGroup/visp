import { AuthProvider } from "@better-auth-ui/react";
import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";
import { agentAuthPlugin } from "@/lib/auth/agent-auth-plugin";
import { agentFinnishLocale } from "@/lib/auth/agent-locale";
import { agentAuthAdapter, agentClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n";

export function AgentProvider({ children }: { children: ReactNode }) {
	const router = useRouter();
	const fi = useLocale() === "fi";
	const plugins = useMemo(
		() => [agentAuthPlugin({ adapter: agentAuthAdapter })],
		[],
	);
	return (
		<AuthProvider
			authClient={agentClient}
			plugins={plugins}
			locale={fi ? agentFinnishLocale : undefined}
			localization={fi ? { settings: { cancel: "Peruuta" } } : undefined}
			navigate={({ to, replace }) => {
				void router.navigate({ href: to, replace });
			}}
		>
			<div data-rybbit-block>{children}</div>
		</AuthProvider>
	);
}
