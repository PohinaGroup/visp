import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import type { SeppoClientToolCall } from "@/components/seppo-widget";
import { probeRelayRtt } from "@/lib/relay";
import { sanitizeDashboardStatus } from "@/lib/seppo-dashboard";
import { useTRPC } from "@/utils/trpc";
import {
	DASHBOARD_AREA_TARGETS,
	type DashboardArea,
	type DashboardMode,
	type DashboardTab,
	type DetailSectionId,
	type NetworkProfile,
} from "./types";

function isDashboardArea(value: unknown): value is DashboardArea {
	return (
		value === "devices" ||
		value === "relay" ||
		value === "obs" ||
		value === "connections" ||
		value === "tuning" ||
		value === "setup"
	);
}

function isDashboardMode(value: unknown): value is DashboardMode {
	return value === "simple" || value === "advanced";
}

function isNetworkProfile(value: unknown): value is NetworkProfile {
	return value === "wired" || value === "wifi" || value === "cellular";
}

function scrollToId(id: string) {
	window.setTimeout(() => {
		document.getElementById(id)?.scrollIntoView({
			behavior: "smooth",
			block: "center",
		});
	}, 100);
}

export function seppoToolActivityLabel(part: {
	type: string;
	input?: unknown;
}): string | null {
	switch (part.type) {
		case "tool-inspectDashboard":
			return "Dashboard status checked";
		case "tool-showDashboardArea": {
			const area =
				typeof part.input === "object" &&
				part.input !== null &&
				"area" in part.input
					? String((part.input as { area?: unknown }).area ?? "dashboard")
					: "dashboard";
			return `Opened ${area}`;
		}
		case "tool-setDashboardMode": {
			const mode =
				typeof part.input === "object" &&
				part.input !== null &&
				"mode" in part.input
					? String((part.input as { mode?: unknown }).mode ?? "updated")
					: "updated";
			return mode === "advanced"
				? "Protocol fallbacks shown"
				: "Protocol fallbacks hidden";
		}
		case "tool-measureRelayConnection":
			return "Relay connection measured";
		default:
			return null;
	}
}

export function useDashboardSeppo(selectTab: (tab: DashboardTab) => void) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [openSections, setOpenSections] = useState<DetailSectionId[]>([]);

	const setAdvanced = useMutation(
		trpc.secrets.setAdvancedMode.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const submitRtt = useMutation(trpc.rtt.submit.mutationOptions());

	const handleToolCall = async (toolCall: SeppoClientToolCall) => {
		switch (toolCall.toolName) {
			case "inspectDashboard": {
				const [secrets, paths, obs, connections] = await Promise.all([
					queryClient.fetchQuery(trpc.secrets.status.queryOptions()),
					queryClient.fetchQuery(trpc.paths.list.queryOptions()),
					queryClient.fetchQuery(trpc.obs.status.queryOptions()),
					queryClient.fetchQuery(trpc.chat.connections.list.queryOptions()),
				]);
				return JSON.stringify(
					sanitizeDashboardStatus({ secrets, paths, obs, connections }),
				);
			}
			case "showDashboardArea": {
				const area =
					typeof toolCall.input === "object" &&
					toolCall.input !== null &&
					"area" in toolCall.input
						? (toolCall.input as { area: unknown }).area
						: undefined;
				if (!isDashboardArea(area)) {
					throw new Error("Unknown dashboard area");
				}
				const target = DASHBOARD_AREA_TARGETS[area];
				selectTab(target.tab);
				if ("section" in target) {
					setOpenSections((current) =>
						current.includes(target.section)
							? current
							: [...current, target.section],
					);
				}
				scrollToId(target.id);
				return `Opened ${area}`;
			}
			case "setDashboardMode": {
				const mode =
					typeof toolCall.input === "object" &&
					toolCall.input !== null &&
					"mode" in toolCall.input
						? (toolCall.input as { mode: unknown }).mode
						: undefined;
				if (!isDashboardMode(mode)) {
					throw new Error("Unknown dashboard mode");
				}
				await setAdvanced.mutateAsync({ advancedMode: mode === "advanced" });
				selectTab("sources");
				return mode === "advanced"
					? "Showing RTMP and SRTLA fallback URLs"
					: "Showing the SRT URL only";
			}
			case "measureRelayConnection": {
				const profile =
					typeof toolCall.input === "object" &&
					toolCall.input !== null &&
					"profile" in toolCall.input
						? (toolCall.input as { profile: unknown }).profile
						: undefined;
				if (!isNetworkProfile(profile)) {
					throw new Error("Unknown network profile");
				}
				const paths = await queryClient.fetchQuery(
					trpc.paths.list.queryOptions(),
				);
				const assignedRelay = paths[0]?.relay;
				if (!assignedRelay) throw new Error("No assigned relay");
				const rttMs = await probeRelayRtt(assignedRelay.pingUrl);
				const guidance = await submitRtt.mutateAsync({
					rttMs,
					profile,
					method: "browser-probe",
					relayId: assignedRelay.id,
				});
				return JSON.stringify({ rttMs, ...guidance });
			}
			default: {
				const unsupported: string = toolCall.toolName;
				throw new Error(`Unsupported dashboard action: ${unsupported}`);
			}
		}
	};

	return {
		open,
		setOpen,
		openSections,
		setOpenSections,
		handleToolCall,
	};
}
