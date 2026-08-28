import {
	alertText,
	type ChatAlert,
	PROVIDER_CHIP,
	PROVIDER_PRESENTATION,
} from "@VISP/api/chat/contract";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
	FadeInDown,
	FadeOutUp,
	LinearTransition,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { visibleAlerts } from "../lib/chat-model";
import { useChatFadeClock } from "../lib/use-chat-fade-clock";

export function AlertBanner({
	alerts,
}: {
	alerts: Array<ChatAlert & { receivedAt: number }>;
}) {
	const newestReceivedAt = alerts.at(-1)?.receivedAt ?? 0;
	const now = useChatFadeClock(true, true, newestReceivedAt);
	const visible = visibleAlerts(alerts, now);
	if (visible.length === 0) return null;

	return (
		<SafeAreaView edges={["top"]} pointerEvents="none" style={styles.layer}>
			{visible.map((alert) => (
				<Animated.View
					accessibilityLabel={alertText(alert)}
					accessibilityLiveRegion="polite"
					accessible
					entering={FadeInDown.duration(200)}
					exiting={FadeOutUp.duration(200)}
					key={`${alert.provider}-${alert.id}`}
					layout={LinearTransition.duration(200)}
					style={[styles.banner, { opacity: alert.opacity }]}
				>
					<View
						style={[
							styles.providerChip,
							{ backgroundColor: PROVIDER_CHIP[alert.provider].background },
						]}
					>
						<Text
							style={[
								styles.providerText,
								{ color: PROVIDER_CHIP[alert.provider].foreground },
							]}
						>
							{PROVIDER_PRESENTATION[alert.provider].initial}
						</Text>
					</View>
					<Text style={styles.text}>{alertText(alert)}</Text>
				</Animated.View>
			))}
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	banner: {
		alignItems: "center",
		backgroundColor: "rgba(0,0,0,0.76)",
		borderCurve: "continuous",
		borderRadius: 16,
		flexDirection: "row",
		gap: 8,
		maxWidth: 360,
		paddingHorizontal: 12,
		paddingVertical: 9,
	},
	layer: {
		alignItems: "center",
		gap: 6,
		left: 0,
		paddingHorizontal: 16,
		paddingTop: 92,
		position: "absolute",
		right: 0,
		top: 0,
	},
	providerChip: {
		alignItems: "center",
		borderRadius: 4,
		height: 18,
		justifyContent: "center",
		width: 18,
	},
	providerText: { fontSize: 10, fontWeight: "900" },
	text: { color: "white", flexShrink: 1, fontSize: 14, fontWeight: "800" },
});
