import { PROVIDER_CHIP, PROVIDER_PRESENTATION } from "@VISP/api/chat/contract";
import type { DirectProvider } from "@VISP/api/direct";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiClient } from "../lib/backend";

const POLL_INTERVAL_MS = 15_000;
const EMPTY_COUNTS: Record<DirectProvider, number | null> = {
	twitch: null,
	kick: null,
	youtube: null,
};

export function useDirectViewerCounts(
	active: boolean,
	providers: DirectProvider[],
) {
	const [counts, setCounts] = useState(EMPTY_COUNTS);

	useEffect(() => {
		if (!active || providers.length === 0) {
			setCounts(EMPTY_COUNTS);
			return;
		}
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const poll = async () => {
			try {
				const next = await apiClient.channel.viewerCounts.query({ providers });
				if (!disposed) setCounts(next);
			} catch {
				if (!disposed) setCounts(EMPTY_COUNTS);
			} finally {
				if (!disposed) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
			}
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [active, providers]);

	return counts;
}

export function DirectViewerOverlay({
	active,
	counts,
	providers,
}: {
	active: boolean;
	counts: Record<DirectProvider, number | null>;
	providers: DirectProvider[];
}) {
	if (!active || providers.length === 0) return null;
	const accessibilityLabel = providers
		.map((provider) => {
			const count = counts[provider];
			return `${PROVIDER_PRESENTATION[provider].label} ${count ?? "unavailable"}${count === null ? "" : count === 1 ? " viewer" : " viewers"}`;
		})
		.join(", ");

	return (
		<SafeAreaView edges={["top"]} pointerEvents="none" style={styles.layer}>
			<View
				accessibilityLabel={accessibilityLabel}
				accessibilityLiveRegion="polite"
				accessible
				style={styles.pill}
			>
				{providers.map((provider) => (
					<View key={provider} style={styles.provider}>
						<View
							style={[
								styles.providerChip,
								{ backgroundColor: PROVIDER_CHIP[provider].background },
							]}
						>
							<Text
								style={[
									styles.providerText,
									{ color: PROVIDER_CHIP[provider].foreground },
								]}
							>
								{PROVIDER_PRESENTATION[provider].initial}
							</Text>
						</View>
						<Text style={styles.count}>{counts[provider] ?? "—"}</Text>
					</View>
				))}
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	count: {
		color: "white",
		fontSize: 13,
		fontVariant: ["tabular-nums"],
		fontWeight: "800",
	},
	layer: {
		alignItems: "center",
		bottom: 0,
		left: 0,
		paddingTop: 52,
		position: "absolute",
		right: 0,
		top: 0,
	},
	pill: {
		backgroundColor: "rgba(0,0,0,0.64)",
		borderRadius: 18,
		flexDirection: "row",
		gap: 12,
		paddingHorizontal: 12,
		paddingVertical: 8,
	},
	provider: { alignItems: "center", flexDirection: "row", gap: 5 },
	providerChip: {
		alignItems: "center",
		borderRadius: 4,
		height: 16,
		justifyContent: "center",
		width: 16,
	},
	providerText: { fontSize: 9, fontWeight: "900" },
});
