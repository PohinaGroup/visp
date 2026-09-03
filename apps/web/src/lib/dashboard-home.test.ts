import { describe, expect, test } from "bun:test";
import { type DashboardHomeInput, dashboardHomeState } from "./dashboard-home";

const input = (overrides: Partial<DashboardHomeInput>): DashboardHomeInput => ({
	mode: "direct",
	desiredDestinations: 1,
	liveOutputs: 0,
	holding: false,
	paths: [{ publishing: false, stale: false }],
	obs: { configured: false, connected: false, streaming: false },
	...overrides,
});

describe("dashboard home readiness", () => {
	test("covers Direct blocked, ready, live, and BRB states", () => {
		expect(
			dashboardHomeState(input({ desiredDestinations: 0 })).primaryAction,
		).toBe("connect-platform");
		expect(dashboardHomeState(input({ paths: [] })).primaryAction).toBe(
			"get-app",
		);
		expect(dashboardHomeState(input({})).status).toBe("ready");
		expect(dashboardHomeState(input({ liveOutputs: 1 })).status).toBe("live");
		expect(dashboardHomeState(input({ holding: true })).primaryAction).toBe(
			"end-stream",
		);
	});

	test("covers OBS pairing, ready, and live states", () => {
		expect(dashboardHomeState(input({ mode: "obs" })).primaryAction).toBe(
			"pair-obs",
		);
		expect(
			dashboardHomeState(
				input({
					mode: "obs",
					obs: { configured: true, connected: true, streaming: false },
				}),
			).primaryAction,
		).toBe("start-obs");
		expect(
			dashboardHomeState(
				input({
					mode: "obs",
					obs: { configured: true, connected: true, streaming: true },
				}),
			).primaryAction,
		).toBe("stop-obs");
	});
});
