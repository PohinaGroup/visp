import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";

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
	const secrets = useQuery(trpc.secrets.status.queryOptions());
	const obs = useQuery(
		trpc.obs.status.queryOptions(undefined, { refetchInterval: 3000 }),
	);
	const paths = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
	);

	const total = paths.data?.length ?? 0;
	const live =
		paths.data?.filter((path) => path.publishing && !path.stale).length ?? 0;
	const readConfigured = secrets.data?.readConfigured ?? false;
	const obsStatus = obs.data;

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
			href: "#obs-read",
			label: t("Relay"),
			state: readConfigured ? "ok" : "warn",
			value: readConfigured ? t("Keys set") : t("Setup needed"),
		},
		{
			href: "#obs-control",
			label: "OBS",
			state: obsStatus?.connected ? "ok" : "idle",
			value: obsStatus?.connected ? t("Connected") : t("Not connected"),
		},
		{
			href: "#obs-control",
			label: t("Output"),
			state: obsStatus?.streaming ? "live" : "idle",
			value: obsStatus?.configured
				? obsStatus.streaming
					? t("On air")
					: t("Off air")
				: t("Not paired"),
		},
	];

	return (
		<nav
			aria-label={t("Signal path")}
			className="w-full overflow-x-auto rounded-[var(--radius)] border border-border"
		>
			<ol className="flex min-w-max items-center p-2">
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
		</nav>
	);
}
