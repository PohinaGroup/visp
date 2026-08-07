import * as UI from "@expo/ui";
import type { CaptionLanguage } from "../lib/speech-preferences";
import type { CameraSettings } from "./stream-settings-camera-section";
import {
	IS_IOS,
	IS_WEB,
	SettingRow,
	SUBTLE_TEXT,
} from "./stream-settings-shared";

export type SpeechSettings = {
	audioIsolationEnabled: boolean;
	betterAudioIsolationAvailable: boolean;
	betterAudioIsolationEnabled: boolean;
	betterCaptions: boolean;
	betterCaptionsEnabled: boolean;
	betterSubtitlesAvailable: boolean;
	captionLanguage: CaptionLanguage;
	captionLanguageActive?: Exclude<CaptionLanguage, "off">;
	onSetAudioIsolationEnabled: (enabled: boolean) => void;
	onSetBetterAudioIsolationEnabled: (enabled: boolean) => void;
	onSetBetterCaptionsEnabled: (enabled: boolean) => void;
	onSetCaptionLanguage: (language: CaptionLanguage) => void;
};

export function AudioSection({
	camera,
	speech,
}: {
	camera: CameraSettings;
	speech: SpeechSettings;
}) {
	return (
		<UI.FieldGroup.Section title="Audio">
			<SettingRow label="Microphone">
				<UI.Picker
					enabled={!camera.settingsDisabled}
					onValueChange={(audioInputId) =>
						camera.onApplyAudioInput(String(audioInputId))
					}
					selectedValue={camera.selectedAudioInputId}
				>
					<UI.Picker.Item label="System default" value="default" />
					{camera.audioInputs.map(({ id, name }) => (
						<UI.Picker.Item key={id} label={name} value={id} />
					))}
				</UI.Picker>
			</SettingRow>
			{camera.settingsDisabled ? (
				<UI.FieldGroup.SectionFooter>
					<UI.Text textStyle={SUBTLE_TEXT}>
						Stop the stream to change the microphone.
					</UI.Text>
				</UI.FieldGroup.SectionFooter>
			) : null}
			{IS_IOS ? (
				<SettingRow label="Audio isolation">
					<UI.Switch
						disabled={camera.settingsDisabled}
						onValueChange={speech.onSetAudioIsolationEnabled}
						value={speech.audioIsolationEnabled}
					/>
				</SettingRow>
			) : null}
			{speech.betterAudioIsolationAvailable &&
			IS_IOS &&
			speech.audioIsolationEnabled ? (
				<SettingRow label="Better audio isolation">
					<UI.Switch
						disabled={camera.settingsDisabled}
						onValueChange={speech.onSetBetterAudioIsolationEnabled}
						value={speech.betterAudioIsolationEnabled}
					/>
				</SettingRow>
			) : null}
			{IS_IOS ? (
				<UI.FieldGroup.SectionFooter>
					<UI.Text textStyle={SUBTLE_TEXT}>
						{speech.betterAudioIsolationAvailable &&
						speech.audioIsolationEnabled &&
						speech.betterAudioIsolationEnabled
							? "Uses hosted processing to remove background noise. Adds about half a second of delay and uses upload bandwidth."
							: "Uses the iPhone's built-in voice isolation. Pick Voice Isolation in Control Center if the system asks."}
					</UI.Text>
				</UI.FieldGroup.SectionFooter>
			) : null}
			{!IS_WEB ? (
				<SettingRow label="Subtitles">
					<UI.Picker
						onValueChange={(language) =>
							speech.onSetCaptionLanguage(language as CaptionLanguage)
						}
						selectedValue={speech.captionLanguage}
					>
						<UI.Picker.Item label="Off" value="off" />
						<UI.Picker.Item label="Suomi" value="fi" />
						<UI.Picker.Item label="English" value="en" />
					</UI.Picker>
				</SettingRow>
			) : null}
			{speech.betterSubtitlesAvailable &&
			!IS_WEB &&
			speech.captionLanguageActive ? (
				<SettingRow label="Better subtitles">
					<UI.Switch
						onValueChange={speech.onSetBetterCaptionsEnabled}
						value={speech.betterCaptionsEnabled}
					/>
				</SettingRow>
			) : null}
			{!IS_WEB && speech.captionLanguageActive ? (
				<UI.FieldGroup.SectionFooter>
					<UI.Text textStyle={SUBTLE_TEXT}>
						{speech.betterCaptions
							? "Burns hosted speech-to-text into the stream while you are live. Uses upload bandwidth."
							: "Burns on-device speech recognition into the stream while you are live. Finnish quality varies by device."}
					</UI.Text>
				</UI.FieldGroup.SectionFooter>
			) : null}
		</UI.FieldGroup.Section>
	);
}
