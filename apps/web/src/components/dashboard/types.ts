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
export type DashboardView =
	| "home"
	| "destinations"
	| "devices"
	| "safety"
	| "chat"
	| "advanced";

export const DASHBOARD_VIEWS = [
	"home",
	"destinations",
	"devices",
	"safety",
	"chat",
	"advanced",
] as const satisfies ReadonlyArray<DashboardView>;

export type DashboardArea =
	| "devices"
	| "relay"
	| "obs"
	| "connections"
	| "tuning"
	| "setup";

export type DetailSectionId = "obs-read" | "tuning" | "reference";

// Each setup area lives on its own tab. Seppo switches to the tab, opens the
// relevant disclosure and scrolls to the exact control.
export const DASHBOARD_AREA_TARGETS = {
	devices: { view: "devices", id: "devices" },
	obs: { view: "destinations", id: "obs-control" },
	relay: { view: "destinations", id: "obs-read", section: "obs-read" },
	connections: { view: "chat", id: "dashboard-connections" },
	tuning: { view: "advanced", id: "dashboard-tuning", section: "tuning" },
	setup: { view: "destinations", id: "dashboard-setup", section: "reference" },
} as const satisfies Record<
	DashboardArea,
	{ view: DashboardView; id: string; section?: DetailSectionId }
>;

export const NETWORK_PROFILE_OPTIONS = [
	{ value: "wired", label: "Wired" },
	{ value: "wifi", label: "Wi-Fi" },
	{ value: "cellular", label: "Cellular" },
] as const satisfies ReadonlyArray<{ value: NetworkProfile; label: string }>;
