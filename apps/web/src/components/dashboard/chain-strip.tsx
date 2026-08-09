import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment } from "react";
import { toast } from "sonner";

import { EYEBROW } from "@/components/page-header";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";

type NodeState = "live" | "ok" | "warn" | "idle";

// Signal-state color, reserved strictly for state (tally red = on air).
const nodeDot: Record<NodeState, { dot: string; pulse: boolean }> = {
	live: { dot: "bg-tally", pulse: true },
	ok: { dot: "bg-signal", pulse: false },
	warn: { dot: "bg-caution", pulse: false },
	idle: { dot: "bg-muted-foreground", pulse: false },
};

function ChainNode({
	href,
	label,
	value,
	state,
}: {
	href: string;
	label: string;
	value: string;
	state: NodeState;
}) {
	const dot = nodeDot[state];
	return (
		<a
			href={href}
			aria-label={`${label}: ${value}`}
			className="group flex min-w-[128px] flex-col gap-2 rounded-[var(--radius)] px-3 py-2 transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
		>
			<span className={EYEBROW}>{label}</span>
			<span className="flex items-center gap-2">
				<span
					className={`inline-block size-2 shrink-0 rounded-full ${dot.dot} ${
						dot.pulse ? "tally-pulse" : ""
					}`}
				/>
				<span className="truncate font-medium text-foreground text-sm">
					{value}
				</span>
			</span>
		</a>
	);
}

// The dashboard's signature: the live signal path as one hairline patch strip,
// echoing the lander's phone → studio → out schematic with real state.
export function ChainStrip() {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const direct = useQuery(
		trpc.direct.list.queryOptions(undefined, { refetchInterval: 3000 }),
	);
	const paths = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
	);
	const stopBrb = useMutation(
		trpc.brb.stop.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("Ending the stream"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	// The ingest is gone but the broadcast is still up on the BRB card. This is
	// the only place that state is visible, so it carries the way out of it.
	const holding = direct.data?.paths.find((path) =>
		(["twitch", "kick", "youtube"] as const).some(
			(provider) => path.state[provider] === "brb",
		),
	);

	const total = paths.data?.length ?? 0;
	const live =
		paths.data?.filter((path) => path.publishing && !path.stale).length ?? 0;
	const desired = direct.data?.desired;
	const configured = Boolean(
		desired?.twitch || desired?.kick || desired?.youtube,
	);
	const liveOutputs =
		direct.data?.paths.flatMap((path) =>
			(["twitch", "kick", "youtube"] as const).filter(
				(provider) => path[provider] && path.state[provider] === "live",
			),
		) ?? [];
	const destinations = [
		desired?.twitch ? "Twitch" : null,
		desired?.kick ? "Kick" : null,
		desired?.youtube ? "YouTube" : null,
	].filter(Boolean);

	const nodes: {
		href: string;
		label: string;
		value: string;
		state: NodeState;
	}[] = [
		{
			href: "#devices",
			label: t("Sources"),
			state: live > 0 ? "live" : total > 0 ? "idle" : "warn",
			value: total === 0 ? t("No devices") : `${live}/${total} ${t("live")}`,
		},
		{
			href: "#devices",
			label: t("Relay"),
			state: live > 0 ? "ok" : "idle",
			value: live > 0 ? t("Receiving") : t("Ready"),
		},
		{
			href: holding ? "#dashboard-brb" : "#dashboard-direct",
			label: "Direct",
			state: holding
				? "warn"
				: liveOutputs.length > 0
					? "live"
					: configured
						? "ok"
						: "warn",
			value: holding
				? t("BRB card")
				: liveOutputs.length > 0
					? `${liveOutputs.length} ${t("live")}`
					: configured
						? t("Ready")
						: t("Choose output"),
		},
		{
			href: "#dashboard-direct",
			label: t("Output"),
			state: liveOutputs.length > 0 ? "live" : configured ? "idle" : "warn",
			value: destinations.join(" + ") || t("OBS only"),
		},
	];

	return (
		<nav
			aria-label={t("Signal path")}
			className="w-full rounded-[var(--radius)] border border-border"
		>
			<ol className="flex min-w-max items-center overflow-x-auto p-2">
				{nodes.map((node, i) => (
					<Fragment key={node.href + node.label}>
						{i > 0 ? (
							<li aria-hidden className="h-px w-6 shrink-0 bg-border sm:w-10" />
						) : null}
						<li>
							<ChainNode
								href={node.href}
								label={node.label}
								state={node.state}
								value={node.value}
							/>
						</li>
					</Fragment>
				))}
			</ol>
			{holding ? (
				<p className="flex flex-wrap items-center gap-x-3 gap-y-2 border-border border-t px-3 py-2 text-sm">
					<span className="text-foreground">
						{t("Your ingest dropped. Viewers see your BRB card.")}
					</span>
					<button
						type="button"
						className="rounded-[var(--radius)] border border-border px-2 py-1 font-medium text-xs hover:bg-card focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-60"
						disabled={stopBrb.isPending}
						onClick={() => stopBrb.mutate({ pathId: holding.id })}
					>
						{t("End stream")}
					</button>
				</p>
			) : null}
		</nav>
	);
}
