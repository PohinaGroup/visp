import type { StudioGraph } from "@VISP/api/studio";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useT } from "@/lib/i18n";
import { resizeStudioLayer } from "@/lib/studio-editor";
import {
	browserSourceUrlError,
	type StudioLayer,
	type StudioLayerUpdate,
	type StudioScene,
	studioLayerDisplayState,
} from "@/lib/studio-model";
import { AlertControls } from "./alert-controls";

export function StudioInspector({
	selectedScene,
	selectedLayer,
	readOnly,
	layerReadOnly,
	aspectLocked,
	setAspectLocked,
	mutateDraft,
	changeLayer,
	uploadImageAsset,
}: {
	selectedScene?: StudioScene;
	selectedLayer?: StudioLayer;
	readOnly: boolean;
	layerReadOnly: boolean;
	aspectLocked: boolean;
	setAspectLocked: (value: boolean) => void;
	mutateDraft: (updater: (graph: StudioGraph) => StudioGraph) => void;
	changeLayer: (id: string, update: StudioLayerUpdate) => void;
	uploadImageAsset: (value: File | File[] | null) => Promise<string | null>;
}) {
	const t = useT();
	const updateLayer = (update: StudioLayerUpdate) => {
		if (selectedLayer) changeLayer(selectedLayer.id, update);
	};
	return (
		<VStack gap={3}>
			<Heading level={2}>{t("Inspector")}</Heading>
			{selectedScene ? (
				<SegmentedControl
					label={t("Transition")}
					isDisabled={readOnly}
					value={selectedScene.transition}
					onChange={(transition) =>
						mutateDraft((graph) => ({
							...graph,
							scenes: graph.scenes.map((scene) =>
								scene.id === selectedScene?.id
									? {
											...scene,
											transition: transition as "cut" | "fade",
										}
									: scene,
							),
						}))
					}
				>
					<SegmentedControlItem label={t("Cut")} value="cut" />
					<SegmentedControlItem label={t("Fade")} value="fade" />
				</SegmentedControl>
			) : null}
			{selectedScene ? (
				<Text color="secondary" type="supporting">
					{selectedScene.transition === "cut"
						? t("Cut: instant switch into this scene.")
						: t(
								"Fade: half-second blend. Uses more of the frame budget than Cut.",
							)}
				</Text>
			) : null}
			{selectedLayer ? (
				<>
					<TextInput
						description={t("Only you see source names.")}
						isDisabled={layerReadOnly}
						label={t("Source name")}
						value={selectedLayer.name}
						onChange={(name) => updateLayer({ name })}
					/>
					<Switch
						description={
							studioLayerDisplayState(selectedLayer).failed
								? t("This source failed at runtime. Turning it on retries it.")
								: t("Hidden sources stay in the scene but are not rendered.")
						}
						isDisabled={layerReadOnly}
						label={t("Visible")}
						value={studioLayerDisplayState(selectedLayer).visible}
						onChange={(visible) =>
							updateLayer({ visible, runtimeDisabled: false })
						}
					/>
					{selectedLayer.type === "text" ? (
						<TextInput
							description={t("Shown on screen exactly as typed.")}
							isDisabled={layerReadOnly}
							label={t("Text")}
							status={
								selectedLayer.text.trim()
									? undefined
									: {
											type: "warning",
											message: t("Empty text renders nothing on screen."),
										}
							}
							value={selectedLayer.text}
							onChange={(text) => updateLayer({ text })}
						/>
					) : null}
					{selectedLayer.type === "browser" ? (
						<TextInput
							description={t(
								"Any public https:// page — a widget, a timer, a chat overlay.",
							)}
							isDisabled={layerReadOnly}
							label={t("Browser URL")}
							status={
								browserSourceUrlError(selectedLayer.url)
									? {
											type: "error",
											message: t(
												"Use an https:// address that opens in a normal browser tab, with no username or password in it.",
											),
										}
									: undefined
							}
							value={selectedLayer.url}
							onChange={(url) => updateLayer({ url })}
						/>
					) : null}
					{selectedLayer.type === "browser" ? (
						<Text color="secondary" type="supporting">
							{t(
								"Some sites refuse to be embedded, so this box can look empty here even though the compositor renders it on air.",
							)}
						</Text>
					) : null}
					{selectedLayer.type === "alert" ? (
						<AlertControls
							key={selectedLayer.id}
							layer={selectedLayer}
							disabled={layerReadOnly}
							update={(update) => changeLayer(selectedLayer.id, update)}
							uploadAsset={uploadImageAsset}
						/>
					) : null}
					{selectedLayer.type === "png" ? (
						<FileInput
							accept="image/png"
							description={t("PNG, up to 10 MB.")}
							isDisabled={layerReadOnly}
							label={t("Replace PNG")}
							maxSize={10 * 1024 * 1024}
							mode="dropzone"
							value={null}
							onChange={() => undefined}
							changeAction={async (value) => {
								const assetId = await uploadImageAsset(value);
								if (assetId) changeLayer(selectedLayer.id, { assetId });
							}}
						/>
					) : null}
					<Switch
						label={t("Lock aspect ratio")}
						value={aspectLocked}
						onChange={setAspectLocked}
					/>
					<Text color="secondary" type="supporting">
						{t(
							"Position and size in pixels. The frame is 1920 × 1080. You can also drag the source in the preview.",
						)}
					</Text>
					<Grid columns={{ minWidth: 100, max: 2, repeat: "fit" }} gap={2}>
						<NumberInput
							isDisabled={layerReadOnly}
							label={t("X position")}
							value={selectedLayer.x}
							onChange={(x) => x !== null && updateLayer({ x })}
						/>
						<NumberInput
							isDisabled={layerReadOnly}
							label={t("Y position")}
							value={selectedLayer.y}
							onChange={(y) => y !== null && updateLayer({ y })}
						/>
						<NumberInput
							isDisabled={layerReadOnly}
							label={t("Width")}
							value={selectedLayer.width}
							onChange={(width) =>
								width !== null &&
								updateLayer(
									aspectLocked
										? resizeStudioLayer(
												selectedLayer,
												"e",
												width - selectedLayer.width,
												0,
												true,
											)
										: { width },
								)
							}
						/>
						<NumberInput
							isDisabled={layerReadOnly}
							label={t("Height")}
							value={selectedLayer.height}
							onChange={(height) =>
								height !== null &&
								updateLayer(
									aspectLocked
										? resizeStudioLayer(
												selectedLayer,
												"s",
												0,
												height - selectedLayer.height,
												true,
											)
										: { height },
								)
							}
						/>
					</Grid>
				</>
			) : (
				<Text color="secondary">
					{t(
						"Nothing selected. Click a source in the preview or the list to edit it.",
					)}
				</Text>
			)}
		</VStack>
	);
}
