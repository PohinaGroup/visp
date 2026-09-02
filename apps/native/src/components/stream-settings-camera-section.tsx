import * as UI from "@expo/ui";
import { useState } from "react";
import type {
	AudioInputCapability,
	CameraCapability,
	VideoConfiguration,
} from "../../modules/visp-srt";
import {
	configurationForFormat,
	supportsImageStabilization,
} from "../lib/camera-settings";
import { SettingsPicker } from "./settings-picker";
import { DESTRUCTIVE, SettingRow, SUBTLE_TEXT } from "./stream-settings-shared";

export type CameraSettings = {
	audioInputs: AudioInputCapability[];
	cameraSwitchDisabled: boolean;
	cameras: CameraCapability[];
	configuration?: VideoConfiguration;
	directContribution: boolean;
	imageStabilizationEnabled: boolean;
	onApplyAudioInput: (audioInputId: string) => void;
	onApplyConfiguration: (configuration: VideoConfiguration) => void;
	onRetry: () => Promise<void>;
	onSelectCamera: (camera: CameraCapability) => void;
	onUpdateImageStabilization: (enabled: boolean) => void;
	selectedAudioInputId: string;
	settingsDisabled: boolean;
};

export function CameraSection({ camera }: { camera: CameraSettings }) {
	const [retrying, setRetrying] = useState(false);
	const currentCamera = camera.cameras.find(
		({ id }) => id === camera.configuration?.cameraId,
	);
	const currentFormat = currentCamera?.formats.find(
		({ height, width }) =>
			height === camera.configuration?.height &&
			width === camera.configuration.width,
	);
	const imageStabilizationSupported = supportsImageStabilization(
		currentCamera,
		camera.configuration,
	);

	if (
		!currentCamera ||
		!currentFormat ||
		!camera.configuration ||
		!currentFormat.fps.includes(camera.configuration.fps)
	) {
		return (
			<UI.FieldGroup.Section title="Camera">
				<SettingRow label="Unavailable">
					<UI.Button
						disabled={retrying}
						label={retrying ? "Trying…" : "Try again"}
						onPress={() => {
							setRetrying(true);
							void camera
								.onRetry()
								.catch(() => undefined)
								.finally(() => setRetrying(false));
						}}
						variant="text"
					/>
				</SettingRow>
				<UI.FieldGroup.SectionFooter>
					<UI.Text textStyle={{ ...SUBTLE_TEXT, color: DESTRUCTIVE }}>
						The camera could not be loaded.
					</UI.Text>
				</UI.FieldGroup.SectionFooter>
			</UI.FieldGroup.Section>
		);
	}

	return (
		<UI.FieldGroup.Section title="Camera">
			{camera.cameras.length > 1 ? (
				<SettingRow label="Camera">
					<SettingsPicker
						enabled={!camera.cameraSwitchDisabled}
						onValueChange={(cameraId) => {
							const selected = camera.cameras.find(({ id }) => id === cameraId);
							if (selected) camera.onSelectCamera(selected);
						}}
						selectedValue={camera.configuration?.cameraId ?? ""}
					>
						{camera.cameras.map(({ id, name }) => (
							<SettingsPicker.Item key={id} label={name} value={id} />
						))}
					</SettingsPicker>
				</SettingRow>
			) : null}
			<SettingRow label="Resolution">
				<SettingsPicker
					enabled={!camera.settingsDisabled}
					onValueChange={(value) => {
						const format = currentCamera?.formats.find(
							({ height, width }) => `${width}x${height}` === value,
						);
						if (currentCamera && format) {
							camera.onApplyConfiguration(
								configurationForFormat(
									currentCamera.id,
									format,
									camera.configuration?.fps,
								),
							);
						}
					}}
					selectedValue={
						currentFormat
							? `${currentFormat.width}x${currentFormat.height}`
							: ""
					}
				>
					{currentCamera?.formats.map((format) => (
						<SettingsPicker.Item
							key={`${format.width}x${format.height}`}
							label={`${format.width}×${format.height}`}
							value={`${format.width}x${format.height}`}
						/>
					))}
				</SettingsPicker>
			</SettingRow>
			<SettingRow label="Frame rate">
				<SettingsPicker
					enabled={!camera.settingsDisabled}
					onValueChange={(fps) => {
						if (camera.configuration) {
							camera.onApplyConfiguration({
								...camera.configuration,
								fps: Number(fps),
							});
						}
					}}
					selectedValue={camera.configuration?.fps ?? 0}
				>
					{currentFormat?.fps.map((fps) => (
						<SettingsPicker.Item key={fps} label={`${fps} fps`} value={fps} />
					))}
				</SettingsPicker>
			</SettingRow>
			{imageStabilizationSupported ? (
				<SettingRow label="Image stabilization">
					<UI.Switch
						disabled={camera.cameraSwitchDisabled}
						onValueChange={camera.onUpdateImageStabilization}
						value={camera.imageStabilizationEnabled}
					/>
				</SettingRow>
			) : null}
			{camera.settingsDisabled ? (
				<UI.FieldGroup.SectionFooter>
					<UI.Text textStyle={SUBTLE_TEXT}>
						Stop the stream to change resolution or frame rate.
					</UI.Text>
				</UI.FieldGroup.SectionFooter>
			) : null}
			{camera.directContribution ? (
				<UI.FieldGroup.SectionFooter>
					<UI.Text textStyle={SUBTLE_TEXT}>
						Direct lowers this device&apos;s contribution bitrate. Platforms
						receive the relay encode; OBS sees the selected resolution at the
						lower bitrate.
					</UI.Text>
				</UI.FieldGroup.SectionFooter>
			) : null}
		</UI.FieldGroup.Section>
	);
}
