import * as UI from "@expo/ui";
import { useRef, useState } from "react";
import { Image, PanResponder, Text, View } from "react-native";
import { nativeDirectText } from "../lib/native-direct-i18n";
import {
	CROP_STEP,
	cropSliderRange,
	cropWithHeight,
	PORTRAIT_WIDTH_RATIO,
	type PortraitCrop,
} from "../lib/portrait-crop";
import type { DirectProvider } from "./stream-settings-shared";

export type PortraitFramingDraft = {
	pathId: number;
	provider?: DirectProvider;
	outputId?: string;
	crop: PortraitCrop;
};

/**
 * ponytail: fixed 16:9 box, so the RN host sizes itself from Yoga and the drag
 * math needs no onLayout round-trip. Bump it if the sheet ever gets wider.
 */
const PREVIEW = { height: 124, width: 220 };

function CropSlider({
	max,
	min,
	onValueChange,
	value,
}: {
	max: number;
	min: number;
	onValueChange: (value: number) => void;
	value: number;
}) {
	const range = cropSliderRange(min, max);
	return (
		<UI.Slider
			disabled={range.disabled}
			max={range.max}
			min={min}
			step={CROP_STEP}
			value={value}
			onValueChange={onValueChange}
		/>
	);
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
								Math.min(1 - start.w, start.x + gesture.dx / PREVIEW.width),
							),
							y: Math.max(
								0,
								Math.min(1 - start.h, start.y + gesture.dy / PREVIEW.height),
							),
						},
					});
					return;
				}
				const maxHeight = Math.min(
					1 - start.y,
					(1 - start.x) / PORTRAIT_WIDTH_RATIO,
				);
				onChange({
					...draft,
					crop: cropWithHeight(
						start,
						Math.min(maxHeight, start.h + gesture.dy / PREVIEW.height),
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
				{/* Every child here is SwiftUI/Compose: React Native views only ever
				    go inside an RNHostView, or the native host throws on mount. */}
				<UI.RNHostView matchContents>
					<View style={{ flexDirection: "row", gap: 12 }}>
						<View
							accessible
							accessibilityLabel={t(
								"Landscape contribution preview with movable portrait crop",
							)}
							style={{
								backgroundColor: "#111",
								height: PREVIEW.height,
								position: "relative",
								width: PREVIEW.width,
							}}
						>
							{previewUrl ? (
								<Image
									resizeMode="cover"
									source={{ uri: previewUrl }}
									style={{ height: "100%", width: "100%" }}
								/>
							) : (
								<Text style={{ color: "white", padding: 8 }}>
									{t("Preview appears while this device is publishing")}
								</Text>
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
								backgroundColor: "#222",
								height: PREVIEW.height,
								overflow: "hidden",
								position: "relative",
								width: Math.round(PREVIEW.height * (9 / 16)),
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
				</UI.RNHostView>
				<UI.Text>{t("Horizontal position")}</UI.Text>
				<CropSlider
					max={1 - crop.w}
					min={0}
					value={crop.x}
					onValueChange={(x) => onChange({ ...draft, crop: { ...crop, x } })}
				/>
				<UI.Text>{t("Vertical position")}</UI.Text>
				<CropSlider
					max={1 - crop.h}
					min={0}
					value={crop.y}
					onValueChange={(y) => onChange({ ...draft, crop: { ...crop, y } })}
				/>
				<UI.Text>{t("Crop size")}</UI.Text>
				<CropSlider
					max={1}
					min={0.25}
					value={crop.h}
					onValueChange={(height) =>
						onChange({ ...draft, crop: cropWithHeight(crop, height) })
					}
				/>
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
