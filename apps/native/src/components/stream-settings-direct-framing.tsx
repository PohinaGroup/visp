import * as UI from "@expo/ui";
import { useRef, useState } from "react";
import { Image, PanResponder, View } from "react-native";
import { nativeDirectText } from "../lib/native-direct-i18n";
import type { DirectProvider } from "./stream-settings-shared";

export type PortraitCrop = {
	x: number;
	y: number;
	w: number;
	h: number;
	aspect: string;
};

export const DEFAULT_PORTRAIT_CROP: PortraitCrop = {
	x: 0.3418,
	y: 0,
	w: 0.3164,
	h: 1,
	aspect: "9:16",
};

export type PortraitFramingDraft = {
	pathId: number;
	provider: DirectProvider;
	crop: PortraitCrop;
};

function cropWithHeight(crop: PortraitCrop, height: number): PortraitCrop {
	const h = Math.max(0.25, Math.min(height, 1 - crop.y));
	const w = h * (81 / 256);
	return {
		...crop,
		h,
		w,
		x: Math.min(crop.x, 1 - w),
	};
}

export function DirectPortraitFraming({
	draft,
	onCancel,
	onChange,
	onSave,
	previewUrl,
	saving,
}: {
	draft: PortraitFramingDraft;
	onCancel: () => void;
	onChange: (draft: PortraitFramingDraft) => void;
	onSave: () => Promise<void>;
	previewUrl: string | null;
	saving: boolean;
}) {
	const [error, setError] = useState<string>();
	const t = nativeDirectText;
	const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
	const gestureStart = useRef(draft.crop);
	const responder = (mode: "move" | "resize") =>
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onPanResponderGrant: () => {
				gestureStart.current = draft.crop;
			},
			onPanResponderMove: (_event, gesture) => {
				const start = gestureStart.current;
				if (mode === "move") {
					onChange({
						...draft,
						crop: {
							...start,
							x: Math.max(
								0,
								Math.min(1 - start.w, start.x + gesture.dx / previewSize.width),
							),
							y: Math.max(
								0,
								Math.min(
									1 - start.h,
									start.y + gesture.dy / previewSize.height,
								),
							),
						},
					});
					return;
				}
				const maxHeight = Math.min(1 - start.y, (1 - start.x) / (81 / 256));
				onChange({
					...draft,
					crop: cropWithHeight(
						start,
						Math.min(maxHeight, start.h + gesture.dy / previewSize.height),
					),
				});
			},
		});
	const move = responder("move");
	const resize = responder("resize");
	const crop = draft.crop;

	return (
		<UI.FieldGroup>
			<UI.FieldGroup.Section title={t("Frame portrait output")}>
				<View style={{ flexDirection: "row", gap: 12 }}>
					<View
						accessible
						accessibilityLabel={t(
							"Landscape contribution preview with movable portrait crop",
						)}
						onLayout={({ nativeEvent }) => setPreviewSize(nativeEvent.layout)}
						style={{
							aspectRatio: 16 / 9,
							backgroundColor: "#111",
							flex: 1,
							position: "relative",
						}}
					>
						{previewUrl ? (
							<Image
								resizeMode="cover"
								source={{ uri: previewUrl }}
								style={{ height: "100%", width: "100%" }}
							/>
						) : (
							<UI.Text textStyle={{ color: "white" }}>
								{t("Preview appears while this device is publishing")}
							</UI.Text>
						)}
						<View
							{...move.panHandlers}
							accessible
							accessibilityLabel={t("Move portrait crop")}
							accessibilityRole="adjustable"
							style={{
								borderColor: "white",
								borderWidth: 2,
								height: `${crop.h * 100}%`,
								left: `${crop.x * 100}%`,
								position: "absolute",
								top: `${crop.y * 100}%`,
								width: `${crop.w * 100}%`,
							}}
						>
							<View
								{...resize.panHandlers}
								accessible
								accessibilityLabel={t("Resize portrait crop")}
								accessibilityRole="adjustable"
								style={{
									backgroundColor: "white",
									bottom: -8,
									height: 16,
									position: "absolute",
									right: -8,
									width: 16,
								}}
							/>
						</View>
					</View>
					<View
						accessible
						accessibilityLabel={t("Simulated portrait output")}
						style={{
							aspectRatio: 9 / 16,
							backgroundColor: "#222",
							overflow: "hidden",
							position: "relative",
							width: 72,
						}}
					>
						{previewUrl ? (
							<Image
								source={{ uri: previewUrl }}
								style={{
									height: `${100 / crop.h}%`,
									left: `${(-crop.x / crop.w) * 100}%`,
									position: "absolute",
									top: `${(-crop.y / crop.h) * 100}%`,
									width: `${100 / crop.w}%`,
								}}
							/>
						) : null}
					</View>
				</View>
				<UI.Text>{t("Horizontal position")}</UI.Text>
				<View accessible accessibilityLabel={t("Horizontal crop position")}>
					<UI.Slider
						max={1 - crop.w}
						min={0}
						step={0.001}
						value={crop.x}
						onValueChange={(x) => onChange({ ...draft, crop: { ...crop, x } })}
					/>
				</View>
				<UI.Text>{t("Vertical position")}</UI.Text>
				<View accessible accessibilityLabel={t("Vertical crop position")}>
					<UI.Slider
						max={1 - crop.h}
						min={0}
						step={0.001}
						value={crop.y}
						onValueChange={(y) => onChange({ ...draft, crop: { ...crop, y } })}
					/>
				</View>
				<UI.Text>{t("Crop size")}</UI.Text>
				<View accessible accessibilityLabel={t("Portrait crop size")}>
					<UI.Slider
						max={1}
						min={0.25}
						step={0.001}
						value={crop.h}
						onValueChange={(height) =>
							onChange({ ...draft, crop: cropWithHeight(crop, height) })
						}
					/>
				</View>
				{error ? (
					<UI.Text textStyle={{ color: "#dc2626" }}>{error}</UI.Text>
				) : null}
				<UI.Row spacing={8}>
					<UI.Button
						label={t("Cancel")}
						onPress={onCancel}
						variant="outlined"
					/>
					<UI.Button
						disabled={saving}
						label={t("Save framing")}
						onPress={() => {
							setError(undefined);
							void onSave().catch(() =>
								setError(
									t("Could not save framing. Check your connection and retry."),
								),
							);
						}}
					/>
				</UI.Row>
			</UI.FieldGroup.Section>
		</UI.FieldGroup>
	);
}
