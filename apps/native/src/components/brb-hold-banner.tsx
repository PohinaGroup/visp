import type { DirectProvider } from "@VISP/api/direct";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { providerLabel } from "./stream-settings-shared";

const POLL_INTERVAL_MS = 15_000;

/**
 * The card is raised on the relay, after this device has already stopped, so
 * there is no local event to render from — only the Direct states the app
 * reports back. Idle polling is deliberately narrow: it runs while the phone is
 * foregrounded and not streaming, which is exactly when a held card is either
 * appearing or waiting to be ended.
 */
export function useBrbHoldPolling(
	active: boolean,
	refresh: () => Promise<void>,
) {
	useEffect(() => {
		if (!active) return;
		let disposed = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const poll = async () => {
			await refresh().catch(() => undefined);
			if (!disposed) timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
		};
		void poll();
		return () => {
			disposed = true;
			clearTimeout(timer);
		};
	}, [active, refresh]);
}

export function BrbHoldBanner({
	busy,
	onEnd,
	providers,
}: {
	busy: boolean;
	onEnd: () => void;
	providers: DirectProvider[];
}) {
	if (providers.length === 0) return null;

	return (
		<SafeAreaView edges={["top"]} pointerEvents="box-none" style={styles.layer}>
			<View style={styles.banner}>
				<View style={styles.copy}>
					<Text style={styles.title}>Your BRB card is live</Text>
					<Text style={styles.detail}>
						{`${providers.map(providerLabel).join(" · ")} · go live again to come back`}
					</Text>
				</View>
				<Pressable
					accessibilityRole="button"
					disabled={busy}
					style={({ pressed }) => [
						styles.button,
						pressed || busy ? styles.buttonPressed : null,
					]}
					onPress={onEnd}
				>
					<Text style={styles.buttonText}>End</Text>
				</Pressable>
			</View>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	banner: {
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.72)",
		borderRadius: 18,
		flexDirection: "row",
		gap: 12,
		paddingHorizontal: 14,
		paddingVertical: 10,
	},
	button: {
		backgroundColor: "#e5484d",
		borderRadius: 12,
		paddingHorizontal: 14,
		paddingVertical: 8,
	},
	buttonPressed: { opacity: 0.6 },
	buttonText: { color: "white", fontSize: 14, fontWeight: "800" },
	copy: { gap: 2 },
	detail: { color: "rgba(255,255,255,0.68)", fontSize: 12 },
	layer: {
		alignItems: "center",
		left: 0,
		paddingTop: 52,
		position: "absolute",
		right: 0,
		top: 0,
	},
	title: { color: "white", fontSize: 14, fontWeight: "800" },
});
