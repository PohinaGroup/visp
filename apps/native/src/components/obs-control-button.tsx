import * as UI from "@expo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import VispSrtModule from "../../modules/visp-srt/src/VispSrtModule";
import { apiClient } from "../lib/backend";

export type ObsStatus = Awaited<ReturnType<typeof apiClient.obs.status.query>>;

export function ObsControls({
	onError,
	onStatusChange,
}: {
	onError: (message: string) => void;
	onStatusChange: (status: ObsStatus | undefined) => void;
}) {
	const [busy, setBusy] = useState(false);
	const [scenesOpen, setScenesOpen] = useState(false);
	const [status, setStatus] = useState<ObsStatus>();
	const inFlight = useRef(false);

	const updateStatus = useCallback(
		(next: ObsStatus | undefined) => {
			setStatus(next);
			onStatusChange(next);
		},
		[onStatusChange],
	);

	useEffect(() => {
		let active = true;
		let timer: ReturnType<typeof setTimeout>;
		const refresh = async () => {
			try {
				const next = await apiClient.obs.status.query();
				if (active) updateStatus(next);
			} catch {
				if (active) updateStatus(undefined);
			} finally {
				if (active) timer = setTimeout(refresh, 3000);
			}
		};
		void refresh();
		return () => {
			active = false;
			clearTimeout(timer);
		};
	}, [updateStatus]);

	const switchScene = useCallback(
		(scene: string, requestId?: string) => {
			if (inFlight.current || status?.pending || !status?.connected) {
				if (requestId) {
					VispSrtModule.replyToWatchSceneCommand(
						requestId,
						"OBS is busy or offline",
					);
				}
				return;
			}
			inFlight.current = true;
			setBusy(true);
			apiClient.obs.setScene
				.mutate({ scene })
				.then((next) => {
					updateStatus(next);
					setScenesOpen(false);
					if (requestId)
						VispSrtModule.replyToWatchSceneCommand(requestId, null);
				})
				.catch((error) => {
					const message =
						error instanceof Error ? error.message : "OBS scene switch failed";
					onError(message);
					if (requestId)
						VispSrtModule.replyToWatchSceneCommand(requestId, message);
				})
				.finally(() => {
					inFlight.current = false;
					setBusy(false);
				});
		},
		[onError, status, updateStatus],
	);

	useEffect(() => {
		if (Platform.OS !== "ios") return;
		const subscription = VispSrtModule.addListener(
			"onWatchSceneCommand",
			({ requestId, scene }) => switchScene(scene, requestId),
		);
		return () => subscription.remove();
	}, [switchScene]);

	if (!status?.configured) return null;
	const disabled = busy || status.pending || !status.connected;
	const streamLabel = !status.connected
		? "OBS offline"
		: status.pending
			? "Waiting for OBS…"
			: status.streaming
				? "Stop OBS"
				: "Start OBS";
	const sceneDisabled = disabled || status.scenes.length === 0;

	return (
		<>
			<View style={styles.controls}>
				<Pressable
					accessibilityLabel={
						status.streaming ? "Stop OBS stream" : "Start OBS stream"
					}
					accessibilityRole="button"
					accessibilityState={{ disabled }}
					disabled={disabled}
					onPress={() => {
						inFlight.current = true;
						setBusy(true);
						apiClient.obs.setStreaming
							.mutate({ streaming: !status.streaming })
							.then(updateStatus)
							.catch((error) =>
								onError(
									error instanceof Error ? error.message : "OBS command failed",
								),
							)
							.finally(() => {
								inFlight.current = false;
								setBusy(false);
							});
					}}
					style={({ pressed }) => [
						styles.button,
						status.streaming && styles.stopButton,
						disabled && styles.disabled,
						pressed && styles.pressed,
					]}
				>
					<Text style={styles.label}>{streamLabel}</Text>
				</Pressable>
				<Pressable
					accessibilityHint="Opens the OBS program scene list"
					accessibilityLabel={`Current OBS scene: ${status.currentScene ?? "unknown"}`}
					accessibilityRole="button"
					accessibilityState={{ disabled: sceneDisabled }}
					disabled={sceneDisabled}
					onPress={() => setScenesOpen(true)}
					style={({ pressed }) => [
						styles.button,
						sceneDisabled && styles.disabled,
						pressed && styles.pressed,
					]}
				>
					<Text numberOfLines={1} style={styles.label}>
						{status.currentScene ?? "OBS scenes"}
					</Text>
				</Pressable>
			</View>
			<UI.BottomSheet
				isPresented={scenesOpen}
				onDismiss={() => setScenesOpen(false)}
				snapPoints={["half", "full"]}
			>
				<UI.FieldGroup>
					<UI.FieldGroup.Section title="OBS program scene">
						{status.scenes.map((scene) => (
							<UI.Row
								alignment="center"
								key={scene}
								onPress={() => switchScene(scene)}
								spacing={12}
							>
								<UI.Text>{scene}</UI.Text>
								<UI.Spacer flexible />
								{scene === status.currentScene ? <UI.Text>✓</UI.Text> : null}
							</UI.Row>
						))}
					</UI.FieldGroup.Section>
				</UI.FieldGroup>
			</UI.BottomSheet>
		</>
	);
}

const styles = StyleSheet.create({
	button: {
		backgroundColor: "rgba(255,255,255,0.16)",
		borderColor: "rgba(255,255,255,0.24)",
		borderRadius: 18,
		borderWidth: 1,
		flex: 1,
		maxWidth: 180,
		paddingHorizontal: 16,
		paddingVertical: 9,
	},
	controls: {
		flexDirection: "row",
		gap: 8,
		justifyContent: "center",
		width: "100%",
	},
	disabled: { opacity: 0.45 },
	label: {
		color: "white",
		fontSize: 13,
		fontWeight: "800",
		textAlign: "center",
	},
	pressed: { transform: [{ scale: 0.98 }] },
	stopButton: { backgroundColor: "rgba(255,53,77,0.78)" },
});
