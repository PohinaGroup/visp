export type DashboardHomeInput = {
	mode: "unconfigured" | "direct" | "obs";
	desiredDestinations: number;
	liveOutputs: number;
	holding: boolean;
	paths: Array<{ publishing: boolean | null; stale: boolean }>;
	obs: {
		configured: boolean;
		connected: boolean;
		streaming: boolean;
	};
};

export type DashboardHomeState = {
	status: "almost-ready" | "ready" | "live";
	primaryAction:
		| "connect-platform"
		| "get-app"
		| "open-app"
		| "end-stream"
		| "pair-obs"
		| "start-obs"
		| "stop-obs";
	nextStep: "connect-platform" | "get-app" | "pair-obs" | null;
};

export function dashboardHomeState(
	input: DashboardHomeInput,
): DashboardHomeState {
	const livePath = input.paths.some((path) => path.publishing && !path.stale);
	switch (input.mode) {
		case "unconfigured":
		case "direct":
			if (input.holding || input.liveOutputs > 0 || livePath) {
				return {
					status: "live",
					primaryAction: "end-stream",
					nextStep: null,
				};
			}
			if (input.desiredDestinations === 0) {
				return {
					status: "almost-ready",
					primaryAction: "connect-platform",
					nextStep: "connect-platform",
				};
			}
			if (input.paths.length === 0) {
				return {
					status: "almost-ready",
					primaryAction: "get-app",
					nextStep: "get-app",
				};
			}
			return { status: "ready", primaryAction: "open-app", nextStep: null };
		case "obs":
			if (input.obs.streaming) {
				return { status: "live", primaryAction: "stop-obs", nextStep: null };
			}
			if (!input.obs.configured || !input.obs.connected) {
				return {
					status: "almost-ready",
					primaryAction: "pair-obs",
					nextStep: "pair-obs",
				};
			}
			return { status: "ready", primaryAction: "start-obs", nextStep: null };
		default: {
			const exhaustive: never = input.mode;
			return exhaustive;
		}
	}
}
