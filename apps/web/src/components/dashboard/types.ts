import type { AppRouter } from "@VISP/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type Outputs = inferRouterOutputs<AppRouter>;

export type PathView = Outputs["paths"]["list"][number];
export type SecretBundle = Outputs["secrets"]["rotate"];
export type CreatedDevice = Outputs["paths"]["create"];
export type Guidance = Outputs["rtt"]["submit"];
export type ObsPairing = Outputs["obs"]["pair"];
export type SnapshotView = Outputs["obs"]["snapshots"][number];
export type ChatConnection = Outputs["chat"]["connections"]["list"][number];
export type DirectOutputs = Outputs["direct"]["list"];
export type DirectSelection = "off" | "twitch" | "kick" | "both";

export type NetworkProfile = "wired" | "wifi" | "cellular";
export type DashboardMode = "simple" | "advanced";
export type DashboardArea =
	| "devices"
	| "relay"
	| "obs"
	| "connections"
	| "tuning"
	| "setup";

export type AdvancedSectionId = "obs-read" | "tuning" | "reference";

export type DashboardAreaTarget =
	| { id: string }
	| { id: string; section: AdvancedSectionId };

export const DASHBOARD_AREA_TARGETS = {
	devices: { id: "devices" },
	obs: { id: "obs-control" },
	relay: { id: "obs-read", section: "obs-read" },
	connections: { id: "dashboard-connections" },
	tuning: { id: "dashboard-tuning", section: "tuning" },
	setup: { id: "dashboard-setup", section: "reference" },
} as const satisfies Record<DashboardArea, DashboardAreaTarget>;

export const NETWORK_PROFILE_OPTIONS = [
	{ value: "wired", label: "Wired" },
	{ value: "wifi", label: "Wi-Fi" },
	{ value: "cellular", label: "Cellular" },
] as const satisfies ReadonlyArray<{ value: NetworkProfile; label: string }>;
