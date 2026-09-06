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

test("camera connection is not a live platform output", () => {
	const connected = input({ paths: [{ publishing: true, stale: false }] });
	expect(dashboardHomeState(connected).status).toBe("source-connected");
	expect(dashboardHomeState({ ...connected, startingOutputs: 1 }).status).toBe(
		"starting",
	);
	expect(dashboardHomeState({ ...connected, failedOutputs: 1 }).status).toBe(
		"failed",
	);
	expect(dashboardHomeState({ ...connected, holding: true }).status).toBe(
		"brb",
	);
	expect(dashboardHomeState({ ...connected, liveOutputs: 1 }).status).toBe(
		"live",
	);
});

test("failed outputs without a connected source lead to output settings", () => {
	expect(dashboardHomeState(input({ failedOutputs: 1 })).primaryAction).toBe(
		"inspect-output",
	);
});
