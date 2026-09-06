import {
	STUDIO_ALERT_EVENTS,
	STUDIO_ALERT_FONTS,
	STUDIO_MEDIA_MAX_BYTES,
	STUDIO_MEDIA_TYPES,
	type StudioAlertAppearance,
	studioAlertAppearance,
	studioAlertEvents,
} from "@VISP/api/studio-alert";
import { Button } from "@astryxdesign/core/Button";
import { FileInput } from "@astryxdesign/core/FileInput";
import { VStack } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { StudioLayer, StudioLayerUpdate } from "@/lib/studio-model";
import { useTRPC } from "@/utils/trpc";

export function AlertControls({
	layer,
	disabled,
	update,
	uploadAsset,
}: {
	layer: Extract<StudioLayer, { type: "alert" }>;
	disabled: boolean;
	update: (value: StudioLayerUpdate) => void;
	uploadAsset: (value: File | File[] | null) => Promise<string | null>;
}) {
	const t = useT();
	const trpc = useTRPC();
	const asset = useQuery(
		trpc.studio.assetUrl.queryOptions(
			{ assetId: layer.assetId ?? "" },
			{ enabled: !!layer.assetId, staleTime: 60_000 },
		),
	);
	const [uploading, setUploading] = useState(false);
	const appearance = studioAlertAppearance(layer);
	const events = studioAlertEvents(layer);
	const change = (value: Partial<StudioAlertAppearance>) =>
		update({ appearance: { ...appearance, ...value } });
	return (
		<VStack gap={3}>
			<Heading level={3}>{t("Alert events")}</Heading>
			{STUDIO_ALERT_EVENTS.map((event) => (
				<Switch
					key={event}
					label={t(event)}
					value={events.includes(event)}
					isDisabled={
						disabled || (events.length === 1 && events.includes(event))
					}
					onChange={(enabled) =>
						update({
							events: STUDIO_ALERT_EVENTS.filter((value) =>
								value === event ? enabled : events.includes(value),
							),
						})
					}
				/>
			))}
			<Heading level={3}>{t("Appearance")}</Heading>
			<Selector
				label={t("Font")}
				options={STUDIO_ALERT_FONTS.map((value) => ({
					value,
					label: {
						barlow: "Barlow",
						"barlow-condensed": "Barlow Condensed",
						"ibm-plex-mono": "IBM Plex Mono",
					}[value],
				}))}
				value={appearance.font}
				isDisabled={disabled}
				onChange={(font) =>
					change({ font: font as StudioAlertAppearance["font"] })
				}
			/>
			<NumberInput
				label={t("Font size")}
				value={appearance.fontSize}
				min={12}
				max={200}
				isDisabled={disabled}
				onChange={(fontSize) => fontSize !== null && change({ fontSize })}
			/>
			<Switch
				label={t("Bold text")}
				value={appearance.fontWeight === 700}
				isDisabled={disabled}
				onChange={(bold) => change({ fontWeight: bold ? 700 : 400 })}
			/>
			<label>
				{t("Text color")}{" "}
				<input
					type="color"
					value={appearance.color}
					disabled={disabled}
					onChange={(event) => change({ color: event.target.value })}
				/>
			</label>
			<NumberInput
				label={t("Outline width")}
				value={appearance.outline}
				min={0}
				max={8}
				isDisabled={disabled}
				onChange={(outline) => outline !== null && change({ outline })}
			/>
			<label>
				{t("Outline color")}{" "}
				<input
					type="color"
					value={appearance.outlineColor}
					disabled={disabled}
					onChange={(event) => change({ outlineColor: event.target.value })}
				/>
			</label>
			<Switch
				label={t("Text shadow")}
				value={appearance.shadow}
				isDisabled={disabled}
				onChange={(shadow) => change({ shadow })}
			/>
			<Switch
				label={t("Transparent background")}
				value={appearance.background === "transparent"}
				isDisabled={disabled}
				onChange={(transparent) =>
					change({ background: transparent ? "transparent" : "#202020" })
				}
			/>
			{appearance.background !== "transparent" && (
				<label>
					{t("Background color")}{" "}
					<input
						type="color"
						value={appearance.background}
						disabled={disabled}
						onChange={(event) => change({ background: event.target.value })}
					/>
				</label>
			)}
			<Heading level={3}>{t("Picture or GIF")}</Heading>
			<FileInput
				accept={STUDIO_MEDIA_TYPES.join(",")}
				label={t(
					layer.assetId ? "Replace picture or GIF" : "Upload picture or GIF",
				)}
				description={t(
					"PNG, JPEG, WebP or GIF, up to 10 MB. Animations up to 30 seconds and 300 frames.",
				)}
				maxSize={STUDIO_MEDIA_MAX_BYTES}
				mode="dropzone"
				value={null}
				onChange={() => undefined}
				isDisabled={disabled || uploading}
				changeAction={async (value) => {
					setUploading(true);
					try {
						const assetId = await uploadAsset(value);
						if (assetId) update({ assetId });
					} finally {
						setUploading(false);
					}
				}}
			/>
			{layer.assetId && (
				<>
					{asset.data?.url && (
						<img
							alt={t("Alert picture")}
							src={asset.data.url}
							style={{ width: "100%", maxHeight: 140, objectFit: "contain" }}
						/>
					)}
					{asset.isError && <Text>{t("Picture could not be loaded")}</Text>}
					<Button
						label={t("Remove picture")}
						variant="ghost"
						isDisabled={disabled || uploading}
						onClick={() => update({ assetId: null })}
					/>
					<Selector
						label={t("Picture layout")}
						options={[
							{ value: "above", label: t("Picture above text") },
							{ value: "beside", label: t("Picture beside text") },
							{ value: "behind", label: t("Picture behind text") },
							{ value: "image-only", label: t("Picture only") },
						]}
						value={appearance.layout}
						isDisabled={disabled}
						onChange={(layout) =>
							change({ layout: layout as StudioAlertAppearance["layout"] })
						}
					/>
					<NumberInput
						label={t("Picture size (%)")}
						value={appearance.imageSize}
						min={10}
						max={90}
						isDisabled={disabled}
						onChange={(imageSize) =>
							imageSize !== null && change({ imageSize })
						}
					/>
					{(appearance.layout === "above" ||
						appearance.layout === "beside") && (
						<NumberInput
							label={t("Picture spacing")}
							value={appearance.gap}
							min={0}
							max={80}
							isDisabled={disabled}
							onChange={(gap) => gap !== null && change({ gap })}
						/>
					)}
				</>
			)}
			<NumberInput
				label={t("Alert duration (seconds)")}
				value={appearance.duration}
				min={1}
				max={30}
				isDisabled={disabled}
				onChange={(duration) => duration !== null && change({ duration })}
			/>
			<Text type="supporting" color="secondary">
				{t(
					"Test alert plays your design in the draft preview. Save and apply to use it on stream.",
				)}
			</Text>
		</VStack>
	);
}
