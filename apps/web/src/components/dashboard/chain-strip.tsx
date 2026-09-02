import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PowerIcon } from "lucide-react";
import { Fragment } from "react";
import { toast } from "sonner";

import { EYEBROW } from "@/components/page-header";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import type { DashboardTab } from "./types";

type NodeState = "live" | "ok" | "warn" | "idle";

// Signal-state color, reserved strictly for state (tally red = on air).
const nodeDot: Record<NodeState, { dot: string; pulse: boolean }> = {
	live: { dot: "bg-tally", pulse: true },
	ok: { dot: "bg-signal", pulse: false },
	warn: { dot: "bg-caution", pulse: false },
	idle: { dot: "bg-muted-foreground", pulse: false },
};

function ChainNode({
	label,
	value,
	state,
	onSelect,
}: {
	label: string;
	value: string;
	state: NodeState;
	onSelect: () => void;
}) {
	const dot = nodeDot[state];
	return (
		<button
			type="button"
			aria-label={`${label}: ${value}`}
			onClick={onSelect}
			className="group flex min-w-[128px] flex-col gap-2 rounded-[var(--radius)] px-3 py-2 text-left transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
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
		</button>
	);
}

/**
 * The dashboard's signature and its transport: the live signal path as one
 * hairline patch strip, with the single action that matters while streaming.
 * It stays above the tabs, so status never depends on which tab is open.
 */
export function ChainStrip({
	onSelect,
}: {
	onSelect: (tab: DashboardTab) => void;
}) {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const direct = useQuery(
		trpc.direct.list.queryOptions(undefined, { refetchInterval: 3000 }),
	);
	const paths = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
	);
	const obs = useQuery(
		trpc.obs.status.queryOptions(undefined, {
			enabled: direct.data?.mode === "obs",
			refetchInterval: 3000,
		}),
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
	const setStreaming = useMutation(
		trpc.obs.setStreaming.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
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
		key: string;
		tab: DashboardTab;
		label: string;
		value: string;
		state: NodeState;
	}[] = [
		{
			key: "sources",
			tab: "sources",
			label: t("Sources"),
			state: live > 0 ? "live" : total > 0 ? "idle" : "warn",
			value: total === 0 ? t("No devices") : `${live}/${total} ${t("live")}`,
		},
		{
			key: "relay",
			tab: "sources",
			label: t("Relay"),
			state: live > 0 ? "ok" : "idle",
			value: live > 0 ? t("Receiving") : t("Ready"),
		},
	];
	if (direct.data?.mode === "obs") {
		const connected = Boolean(obs.data?.connected);
		nodes.push(
			{
				key: "mode",
				tab: "output",
				label: t("Primary mode"),
				state: connected ? "ok" : "warn",
				value: t("Route to Home Studio"),
			},
			{
				key: "output",
				tab: "output",
				label: t("Output"),
				state: obs.data?.streaming ? "live" : connected ? "idle" : "warn",
				value: connected
					? t(obs.data?.streaming ? "OBS streaming" : "OBS connected")
					: t("Pair OBS"),
			},
		);
	} else {
		nodes.push(
			{
				key: "mode",
				tab: holding ? "brb" : "output",
				label: t("Direct to Platform"),
				state: holding
					? "warn"
					: liveOutputs.length > 0
						? "live"
						: configured
							? "ok"
							: "warn",
				value: holding
					? t("Showing BRB card")
					: liveOutputs.length > 0
						? `${liveOutputs.length} ${t("live")}`
						: configured
							? t("Ready")
							: t("Choose output"),
			},
			{
				key: "output",
				tab: "output",
				label: t("Output"),
				state: liveOutputs.length > 0 ? "live" : configured ? "idle" : "warn",
				value: destinations.join(" + ") || t("Choose output"),
			},
		);
	}

	// One action, chosen by what the signal path can actually do right now.
	const action =
		direct.data?.mode === "obs" &&
		live > 0 &&
		obs.data?.streaming ? null : direct.data?.mode === "obs" ? (
			obs.data?.connected ? (
				<Button
					icon={<Icon color="inherit" icon={PowerIcon} size="sm" />}
					isDisabled={Boolean(obs.data.pending) || setStreaming.isPending}
					label={t(obs.data.streaming ? "Stop OBS stream" : "Start OBS stream")}
					variant="primary"
					onClick={() =>
						setStreaming.mutate({ streaming: !obs.data?.streaming })
					}
				/>
			) : (
				<Button
					label={t("Pair OBS")}
					variant="secondary"
					onClick={() => onSelect("output")}
				/>
			)
		) : holding ? (
			<Button
				isLoading={stopBrb.isPending}
				label={t("End stream")}
				variant="primary"
				onClick={() => stopBrb.mutate({ pathId: holding.id })}
			/>
		) : null;

	return (
		<nav
			aria-label={t("Signal path")}
			className="w-full rounded-[var(--radius)] border border-border"
		>
			<div className="flex flex-wrap items-center gap-2 p-2">
				<ol className="flex min-w-0 flex-1 items-center overflow-x-auto">
					{nodes.map((node, i) => (
						<Fragment key={node.key}>
							{i > 0 ? (
								<li
									aria-hidden
									className="h-px w-6 shrink-0 bg-border sm:w-10"
								/>
							) : null}
							<li>
								<ChainNode
									label={node.label}
									state={node.state}
									value={node.value}
									onSelect={() => onSelect(node.tab)}
								/>
							</li>
						</Fragment>
					))}
				</ol>
				{action ? <div className="shrink-0 px-1">{action}</div> : null}
			</div>
			{holding ? (
				<p className="border-border border-t px-3 py-2 text-sm">
					{t("Your ingest dropped. Viewers see your BRB card.")}
				</p>
			) : null}
		</nav>
	);
}
