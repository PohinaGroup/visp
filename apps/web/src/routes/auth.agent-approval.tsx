import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AgentApproval } from "@/components/auth/agent-auth/agent-approval";
import { AgentProvider } from "@/components/auth/agent-auth/agent-provider";

export const Route = createFileRoute("/auth/agent-approval")({
	ssr: false,
	validateSearch: z.object({
		agent_id: z.string().max(256).optional(),
		approval_id: z.string().max(256).optional(),
		code: z.string().max(256).optional(),
		lang: z.literal("fi").optional(),
	}),
	head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }, { name: "referrer", content: "no-referrer" }] }),
	component: () => <main className="mx-auto w-full max-w-xl px-6 py-14">
		<AgentProvider><AgentApproval /></AgentProvider>
	</main>,
});
