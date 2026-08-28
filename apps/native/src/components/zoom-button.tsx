import {
	GlassView,
	isGlassEffectAPIAvailable,
	isLiquidGlassAvailable,
} from "expo-glass-effect";
import { Pressable, Text, View } from "react-native";
import { formatZoomLevel } from "../lib/camera-settings";
import { streamScreenStyles as styles } from "./stream-screen.styles";

const LIQUID_GLASS_AVAILABLE =
	isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

export function ZoomButton({
	disabled,
	level,
	onPress,
	selected,
}: {
	disabled: boolean;
	level: number;
	onPress: () => void;
	selected: boolean;
}) {
	const label = formatZoomLevel(level);
	const button = (
		<Pressable
			accessibilityLabel={`Set zoom to ${label}`}
			accessibilityRole="button"
			accessibilityState={{ disabled, selected }}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => [
				styles.zoomButtonPressable,
				pressed && styles.buttonPressed,
			]}
		>
			<Text style={styles.zoomButtonText}>{label}</Text>
		</Pressable>
	);
	if (LIQUID_GLASS_AVAILABLE) {
		return (
			<GlassView
				glassEffectStyle="regular"
				isInteractive={!disabled}
				style={[styles.zoomButton, disabled && styles.actionDisabled]}
				tintColor={selected ? "rgba(255,53,77,0.58)" : undefined}
			>
				{button}
			</GlassView>
		);
	}
	return (
		<View
			style={[
				styles.zoomButton,
				styles.zoomButtonFallback,
				selected && styles.zoomButtonSelected,
				disabled && styles.actionDisabled,
			]}
		>
			{button}
		</View>
	);
}
