import { describe, expect, test } from "bun:test";
import { sanitizeDashboardStatus } from "./seppo-dashboard";

describe("Seppo dashboard status", () => {
	test("keeps troubleshooting state and excludes credentials and URLs", () => {
		const status = sanitizeDashboardStatus({
			secrets: {
				advancedMode: false,
				onboardedAt: "2026-07-21T10:00:00.000Z",
				streamingSoftware: "visp",
				setupUseCase: "phone_to_obs",
				streamDestination: "twitch",
				readConfigured: true,
				readRevealable: true,
			},
			paths: [
				{
					label: "Main phone",
					publishOrigin: "native",
					publishing: true,
					stale: false,
					publishLastConnectedAt: "2026-07-21T10:01:00.000Z",
				},
			],
			obs: {
				configured: true,
				connected: true,
				pending: false,
				streaming: false,
			},
			connections: [
				{
					provider: "twitch",
					linked: true,
					enabled: true,
					needsConsent: false,
				},
			],
			direct: {
				mode: "direct",
				desired: { twitch: true, kick: false, youtube: false },
				customOutputs: [],
			},
		});

		expect(status.relay.liveDeviceCount).toBe(1);
		expect(status.obs.connected).toBe(true);
		expect(status.direct).toEqual({
			mode: "direct",
			destinationCount: 1,
			ready: true,
		});
		const serialized = JSON.stringify(status);
		expect(serialized).not.toContain("secret");
		expect(serialized).not.toContain("token");
		expect(serialized).not.toContain("url");
		expect(serialized).not.toContain("accountId");
	});
});
