import {
	type ChatProvider,
	type ChatProviderStatus,
	PROVIDER_PRESENTATION,
} from "@VISP/api/chat/contract";
import * as UI from "@expo/ui";
import type { AudioOutputCapability } from "../../modules/visp-srt";
import { VispRoutePicker } from "../../modules/visp-srt";
import type { apiClient } from "../lib/backend";
import type { ChatPreferences } from "../lib/chat-preferences";
import {
	IS_IOS,
	IS_WEB,
	SettingRow,
	SUBTLE,
	SUBTLE_TEXT,
} from "./stream-settings-shared";

type ChatConnections = Awaited<
	ReturnType<typeof apiClient.chat.connections.list.query>
>;
type ChatStatuses = Partial<Record<ChatProvider, ChatProviderStatus["state"]>>;

export type ChatSettings = {
	betterTts: boolean;
	busy: boolean;
	connections: ChatConnections;
	currentAudioOutput?: string;
	enabled: boolean;
	errors: Partial<Record<ChatProvider, string>>;
	onReauthorizeConnection: (connection: ChatConnections[number]) => void;
	onToggleConnection: (connection: ChatConnections[number]) => void;
	onUnlinkConnection: (connection: ChatConnections[number]) => void;
	onSelectOutput: (outputId: string) => Promise<void>;
	onUpdatePreferences: (
		updater: (current: ChatPreferences) => ChatPreferences,
	) => void;
	preferences: ChatPreferences;
	outputId: string;
	outputs: AudioOutputCapability[];
	speechVoiceMissing: boolean;
	spokenLanguage?: string;
	statuses: ChatStatuses;
};

export function ChatSection({ chat }: { chat: ChatSettings }) {
	return (
		<>
			<UI.FieldGroup.Section title="Chat">
				{chat.connections.map((connection) => (
					<UI.Row alignment="center" key={connection.provider} spacing={12}>
						<UI.Column spacing={2}>
							<UI.Text>
								{PROVIDER_PRESENTATION[connection.provider].label}
							</UI.Text>
							<UI.Text textStyle={SUBTLE_TEXT}>
								{connection.enabled
									? (chat.errors[connection.provider] ??
										(chat.statuses[connection.provider] === "error"
											? `${PROVIDER_PRESENTATION[connection.provider].label} chat could not be started`
											: `Chat ${chat.statuses[connection.provider] ?? "connected"}`))
									: connection.linked
										? "Linked · chat off"
										: "Not linked"}
							</UI.Text>
						</UI.Column>
						<UI.Spacer flexible />
						{connection.linked ? (
							<UI.Button
								disabled={chat.busy}
								label="Re-authorize"
								onPress={() => chat.onReauthorizeConnection(connection)}
								variant="text"
							/>
						) : null}
						{connection.linked &&
						chat.connections.filter(({ linked }) => linked).length > 1 ? (
							<UI.Button
								disabled={chat.busy}
								label="Unlink"
								onPress={() => chat.onUnlinkConnection(connection)}
								variant="text"
							/>
						) : null}
						{connection.linked && !connection.needsConsent ? (
							<UI.Switch
								disabled={chat.busy}
								onValueChange={() => chat.onToggleConnection(connection)}
								value={connection.enabled}
							/>
						) : (
							<UI.Button
								disabled={chat.busy}
								label={connection.needsConsent ? "Authorize" : "Link"}
								onPress={() => chat.onToggleConnection(connection)}
								variant="outlined"
							/>
						)}
					</UI.Row>
				))}
				{!chat.enabled ? (
					<UI.FieldGroup.SectionFooter>
						<UI.Text textStyle={SUBTLE_TEXT}>
							Link and enable a chat to set up the overlay.
						</UI.Text>
					</UI.FieldGroup.SectionFooter>
				) : null}
			</UI.FieldGroup.Section>

			{chat.enabled ? (
				<UI.FieldGroup.Section title="Chat overlay">
					<SettingRow label="Position">
						<UI.Picker
							onValueChange={(mode) =>
								chat.onUpdatePreferences((current) => ({
									...current,
									mode: mode as ChatPreferences["mode"],
								}))
							}
							selectedValue={chat.preferences.mode}
						>
							<UI.Picker.Item label="Hidden" value="hidden" />
							<UI.Picker.Item label="Floating" value="floating" />
							{!IS_WEB ? (
								<UI.Picker.Item label="Embedded in stream" value="embedded" />
							) : null}
						</UI.Picker>
					</SettingRow>
					{!IS_WEB && chat.preferences.mode === "embedded" ? (
						<SettingRow label="Corner">
							<UI.Picker
								onValueChange={(corner) =>
									chat.onUpdatePreferences((current) => ({
										...current,
										corner: corner as ChatPreferences["corner"],
									}))
								}
								selectedValue={chat.preferences.corner}
							>
								<UI.Picker.Item label="Top left" value="top-left" />
								<UI.Picker.Item label="Top right" value="top-right" />
								<UI.Picker.Item label="Bottom left" value="bottom-left" />
								<UI.Picker.Item label="Bottom right" value="bottom-right" />
							</UI.Picker>
						</SettingRow>
					) : null}
					<SettingRow label="Disappearing messages">
						<UI.Switch
							onValueChange={(disappearingMessages) =>
								chat.onUpdatePreferences((current) => ({
									...current,
									disappearingMessages,
								}))
							}
							value={chat.preferences.disappearingMessages}
						/>
					</SettingRow>
					<SettingRow label="Speak messages">
						<UI.Picker
							onValueChange={(speechLanguage) =>
								chat.onUpdatePreferences((current) => ({
									...current,
									speechLanguage:
										speechLanguage as ChatPreferences["speechLanguage"],
								}))
							}
							selectedValue={chat.preferences.speechLanguage}
						>
							<UI.Picker.Item label="Off" value="off" />
							<UI.Picker.Item label="Suomi" value="fi-FI" />
							<UI.Picker.Item label="English" value="en-US" />
						</UI.Picker>
					</SettingRow>
					{chat.betterTts && !IS_WEB && chat.spokenLanguage ? (
						<SettingRow label="Better voice">
							<UI.Switch
								onValueChange={(betterVoice) =>
									chat.onUpdatePreferences((current) => ({
										...current,
										betterVoice,
									}))
								}
								value={chat.preferences.betterVoice}
							/>
						</SettingRow>
					) : null}
					{!IS_WEB && chat.spokenLanguage ? (
						<SettingRow label="Speak to">
							{IS_IOS ? (
								<>
									<UI.Text textStyle={SUBTLE_TEXT}>
										{chat.currentAudioOutput ?? "System output"}
									</UI.Text>
									<VispRoutePicker
										accessibilityLabel="Choose speech output"
										activeTintColor="#0a84ff"
										style={{ height: 32, width: 32 }}
										tintColor={SUBTLE}
									/>
								</>
							) : (
								<UI.Picker
									onValueChange={(outputId) =>
										void chat.onSelectOutput(String(outputId))
									}
									selectedValue={chat.outputId}
								>
									<UI.Picker.Item label="System default" value="default" />
									{chat.outputs.map(({ id, name }) => (
										<UI.Picker.Item key={id} label={name} value={id} />
									))}
								</UI.Picker>
							)}
						</SettingRow>
					) : null}
					{chat.spokenLanguage ? (
						<UI.FieldGroup.SectionFooter>
							<UI.Text textStyle={SUBTLE_TEXT}>
								{chat.speechVoiceMissing
									? "This language has no voice installed on this device. Add it in the system text-to-speech settings."
									: "Reads new chat messages aloud while the app is open."}
							</UI.Text>
						</UI.FieldGroup.SectionFooter>
					) : null}
				</UI.FieldGroup.Section>
			) : null}
		</>
	);
}
