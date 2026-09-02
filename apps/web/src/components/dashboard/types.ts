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

export type NetworkProfile = "wired" | "wifi" | "cellular";
export type DashboardMode = "simple" | "advanced";

/** The workbench tabs, in signal order. "brb" only exists in Direct mode. */
export type DashboardTab = "sources" | "output" | "brb" | "chat";

export type DashboardArea =
	| "devices"
	| "relay"
	| "obs"
	| "connections"
	| "tuning"
	| "setup";

export type DetailSectionId = "obs-read" | "tuning" | "reference" | "mode";

// Seppo names areas; the dashboard answers with a tab, an element to scroll to,
// and — for a collapsed section — the disclosure to open.
export const DASHBOARD_AREA_TARGETS = {
	devices: { tab: "sources", id: "devices" },
	obs: { tab: "output", id: "obs-control" },
	relay: { tab: "output", id: "obs-read", section: "obs-read" },
	connections: { tab: "chat", id: "dashboard-connections" },
	tuning: { tab: "sources", id: "dashboard-tuning", section: "tuning" },
	setup: { tab: "output", id: "dashboard-setup", section: "reference" },
} as const satisfies Record<
	DashboardArea,
	{ tab: DashboardTab; id: string; section?: DetailSectionId }
>;

export const NETWORK_PROFILE_OPTIONS = [
	{ value: "wired", label: "Wired" },
	{ value: "wifi", label: "Wi-Fi" },
	{ value: "cellular", label: "Cellular" },
] as const satisfies ReadonlyArray<{ value: NetworkProfile; label: string }>;
