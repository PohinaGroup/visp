import * as UI from "@expo/ui";
import type { BondingMode } from "../../modules/visp-srt";
import { SettingsPicker } from "./settings-picker";
import {
	type AccountSettings,
	AdvancedSection,
	type AdvancedSettings,
	type NetworkSettings,
} from "./stream-settings-advanced-section";
import {
	AudioSection,
	type SpeechSettings,
} from "./stream-settings-audio-section";
import {
	CameraSection,
	type CameraSettings,
} from "./stream-settings-camera-section";
import { ChatSection, type ChatSettings } from "./stream-settings-chat-section";
import {
	BrbSection,
	DirectSection,
	type DirectSettings,
} from "./stream-settings-direct-section";
import {
	type DestinationSettings,
	IS_IOS,
	IS_WEB,
	SettingRow,
	SUBTLE_TEXT,
} from "./stream-settings-shared";

export type StreamSettingsSheetProps = {
	account?: AccountSettings;
	accountOpen: boolean;
	advanced: AdvancedSettings;
	advancedOpen: boolean;
	camera: CameraSettings;
	chat: ChatSettings;
	destination: DestinationSettings;
	direct: DirectSettings;
	isPresented: boolean;
	network: NetworkSettings;
	onDismiss: () => void;
	onSignIn: () => void;
	onToggleAccount: () => void;
	onToggleAdvanced: () => void;
	speech: SpeechSettings;
};

export function StreamSettingsSheet({
	account,
	advanced,
	advancedOpen,
	camera,
	chat,
	destination,
	direct,
	isPresented,
	network,
	onDismiss,
	onSignIn,
	onToggleAdvanced,
	onToggleAccount,
	accountOpen,
	speech,
}: StreamSettingsSheetProps) {
	return (
		<UI.BottomSheet
			isPresented={isPresented}
			onDismiss={onDismiss}
			snapPoints={IS_IOS || IS_WEB ? ["half", "full"] : ["full"]}
		>
			<UI.FieldGroup>
				<CameraSection camera={camera} />
				<AudioSection camera={camera} speech={speech} />
				{!IS_WEB ? (
					<UI.FieldGroup.Section title="Network">
						<SettingRow label="Network bonding">
							<UI.Switch
								disabled={camera.settingsDisabled}
								onValueChange={(enabled) =>
									void network.onUpdateBondingMode(enabled ? "srtla" : "off")
								}
								value={network.bondingMode !== "off"}
							/>
						</SettingRow>
						{network.bondingMode !== "off" ? (
							<SettingRow label="Mode">
								<SettingsPicker
									enabled={!camera.settingsDisabled}
									onValueChange={(mode) =>
										void network.onUpdateBondingMode(
											mode as Exclude<BondingMode, "off">,
										)
									}
									selectedValue={network.bondingMode}
								>
									<SettingsPicker.Item
										label="SRTLA (aggregating)"
										value="srtla"
									/>
									<SettingsPicker.Item label="Broadcast" value="broadcast" />
									<SettingsPicker.Item label="Main + backup" value="backup" />
								</SettingsPicker>
							</SettingRow>
						) : null}
						{network.bondingMode === "broadcast" ? (
							<UI.FieldGroup.SectionFooter>
								<UI.Text textStyle={SUBTLE_TEXT}>
									Broadcast sends every packet over both links and can roughly
									double mobile data use.
								</UI.Text>
							</UI.FieldGroup.SectionFooter>
						) : null}
					</UI.FieldGroup.Section>
				) : null}
				{account ? <ChatSection chat={chat} /> : null}
				{account ? <DirectSection direct={direct} /> : null}
				{account ? <BrbSection direct={direct} /> : null}
				<AdvancedSection
					account={account}
					accountOpen={accountOpen}
					advanced={advanced}
					advancedOpen={advancedOpen}
					destination={destination}
					direct={direct}
					onSignIn={onSignIn}
					onToggleAccount={onToggleAccount}
					onToggleAdvanced={onToggleAdvanced}
					settingsDisabled={camera.settingsDisabled}
				/>
			</UI.FieldGroup>
		</UI.BottomSheet>
	);
}
