"use client";

import { Button } from "@VISP/ui/components/button";
import { Card, CardContent } from "@VISP/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";

function describe(input: string) {
	try {
		const action = JSON.parse(input) as Record<string, unknown>;
		if (action.action === "channel-update") {
			const providers = [
				action.title !== undefined && "Twitch, Kick, YouTube",
				action.twitchCategoryId !== undefined && "Twitch",
				action.kickCategoryId !== undefined && "Kick",
			]
				.filter(Boolean)
				.join("; ");
			return `Update channel: ${Object.entries(action)
				.filter(([key]) => key !== "action")
				.map(([key, value]) => `${key} = ${value}`)
				.join(", ")}. Affects ${providers}.`;
		}
		if (action.action === "obs-scene") return `Switch OBS to ${action.scene}`;
		return action.action === "obs-start"
			? "Start OBS streaming"
			: "Stop OBS streaming";
	} catch {
		return "Agent action";
	}
}

export function AgentActionRequests() {
	const trpc = useTRPC();
	const client = useQueryClient();
	const requests = useQuery(trpc.agent.pendingActions.queryOptions());
	const resolve = useMutation(
		trpc.agent.resolveAction.mutationOptions({
			onSuccess: () => void client.invalidateQueries(),
		}),
	);
	if (!requests.data?.length) return null;
	return (
		<section className="flex flex-col gap-3" aria-label="Agent action requests">
			<div>
				<h2 className="font-semibold text-sm">Action requests</h2>
				<p className="text-muted-foreground text-xs">
					Review exactly what the agent wants to change.
				</p>
			</div>
			{requests.data.map((request) => (
				<Card key={request.id} className="p-0">
					<CardContent className="flex flex-col gap-3 p-4">
						<div className="flex flex-col gap-1">
							<span className="font-medium text-sm">{request.agentName}</span>
							<span className="text-sm">{describe(request.input)}</span>
							<span className="text-muted-foreground text-xs">
								Expires {new Date(request.expiresAt).toLocaleString()}
							</span>
						</div>
						<div className="flex gap-2">
							<Button
								type="button"
								size="sm"
								disabled={resolve.isPending}
								onClick={() =>
									resolve.mutate({ id: request.id, approve: true })
								}
							>
								Approve
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={resolve.isPending}
								onClick={() =>
									resolve.mutate({ id: request.id, approve: false })
								}
							>
								Reject
							</Button>
						</div>
						{resolve.isError && (
							<p role="alert" className="text-destructive text-sm">
								Could not resolve this request.
							</p>
						)}
					</CardContent>
				</Card>
			))}
		</section>
	);
}
