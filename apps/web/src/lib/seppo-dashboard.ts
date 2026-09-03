type DashboardStatusInput = {
	secrets: {
		advancedMode: boolean;
		onboardedAt: string | null;
		streamingSoftware: string | null;
		setupUseCase: string | null;
		streamDestination: string | null;
		readConfigured: boolean;
		readRevealable: boolean;
	};
	paths: Array<{
		label: string;
		publishOrigin: string;
		publishing: boolean | null;
		stale: boolean;
		publishLastConnectedAt: string | null;
	}>;
	obs: {
		configured: boolean;
		connected: boolean;
		pending: boolean;
		streaming: boolean;
	};
	connections: Array<{
		provider: string;
		linked: boolean;
		enabled: boolean;
		needsConsent: boolean;
	}>;
	direct: {
		mode: "unconfigured" | "direct" | "obs";
		desired: { twitch: boolean; kick: boolean; youtube: boolean };
		customOutputs: unknown[];
	};
};

export function sanitizeDashboardStatus({
	secrets,
	paths,
	obs,
	connections,
	direct,
}: DashboardStatusInput) {
	return {
		setup: {
			advancedMode: secrets.advancedMode,
			onboarded: Boolean(secrets.onboardedAt),
			publisher: secrets.streamingSoftware,
			useCase: secrets.setupUseCase,
			destination: secrets.streamDestination,
		},
		relay: {
			readConfigured: secrets.readConfigured,
			readRevealable: secrets.readRevealable,
			deviceCount: paths.length,
			liveDeviceCount: paths.filter((path) => path.publishing && !path.stale)
				.length,
		},
		devices: paths.map((path) => ({
			label: path.label,
			origin: path.publishOrigin,
			publishing: path.publishing,
			statusKnown: !path.stale,
			lastConnectedAt: path.publishLastConnectedAt,
		})),
		obs: {
			configured: obs.configured,
			connected: obs.connected,
			pending: obs.pending,
			streaming: obs.streaming,
		},
		direct: {
			mode: direct.mode,
			destinationCount:
				Number(direct.desired.twitch) +
				Number(direct.desired.kick) +
				Number(direct.desired.youtube) +
				direct.customOutputs.length,
			ready:
				direct.mode === "direct" &&
				(direct.desired.twitch ||
					direct.desired.kick ||
					direct.desired.youtube ||
					direct.customOutputs.length > 0),
		},
		chat: connections.map((connection) => ({
			provider: connection.provider,
			linked: connection.linked,
			enabled: connection.enabled,
			needsConsent: connection.needsConsent,
		})),
	};
}
