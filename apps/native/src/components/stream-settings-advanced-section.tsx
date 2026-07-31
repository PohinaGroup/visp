import * as UI from "@expo/ui";
import type { BondingMode } from "../../modules/visp-srt";
import type { apiClient } from "../lib/backend";
import {
	DESTRUCTIVE,
	DestinationSection,
	type DestinationSettings,
	ExpanderRow,
	SUBTLE,
	SUBTLE_TEXT,
} from "./stream-settings-shared";

type PublishDevices = Awaited<ReturnType<typeof apiClient.paths.list.query>>;
type DirectOutputs = Awaited<ReturnType<typeof apiClient.direct.list.query>>;
type DirectPath = DirectOutputs["paths"][number];

export type AccountSettings = {
	email: string;
	name: string;
	onSignOut: () => void;
};

export type AdvancedSettings = {
	directOutputs?: DirectOutputs;
	installationId?: string;
	onApplyDirectSelection: (pathId: number, selection: string) => void;
	onAuthorizeDirect: (provider: "twitch" | "kick") => void;
	onRevealPublishDevice: (pathId: number) => void;
	publishDevices: PublishDevices;
	revealedDeviceUrls: Record<number, string>;
};

export type NetworkSettings = {
	bondingMode: BondingMode;
	onUpdateBondingMode: (mode: BondingMode) => Promise<void>;
};

function directSelectionOf(path: DirectPath) {
	if (path.twitch && path.kick) return "both";
	if (path.twitch) return "twitch";
	if (path.kick) return "kick";
	return "off";
}

function directStateSummary(path: DirectPath) {
	const parts = (["twitch", "kick"] as const).flatMap((provider) => {
		const state = path.state[provider];
		if (!state) return [];
		const label = provider === "twitch" ? "Twitch" : "Kick";
		return [`${label} ${path.error[provider] ?? state}`];
	});
	return parts.length > 0 ? parts.join(" · ") : "No direct output";
}

function directWarning(outputs: DirectOutputs) {
	const lines = [
		"OBS can still read this feed, but do not let it stream to a provider Direct already owns. What OBS reads is your device's contribution feed, not the encode the platform receives.",
	];
	if (outputs.paths.some((path) => path.twitch)) {
		lines.push(
			"Twitch's simulcasting terms prohibit showing another platform's activity on the Twitch stream, so do not burn Kick chat into the video. Floating chat stays fine — only you see it.",
		);
	}
	if (outputs.paths.some((path) => path.twitch && path.kick)) {
		lines.push(
			"Kick Partners must switch on Kick's own Multistreaming toggle. Kick currently reduces Partner Program payout during a multistreaming session.",
		);
	}
	return lines.join("\n\n");
}

export function AdvancedSection({
	account,
	accountOpen,
	advanced,
	advancedOpen,
	chatBusy,
	destination,
	onToggleAccount,
	onToggleAdvanced,
	settingsDisabled,
}: {
	account?: AccountSettings;
	accountOpen: boolean;
	advanced: AdvancedSettings;
	advancedOpen: boolean;
	chatBusy: boolean;
	destination: DestinationSettings;
	onToggleAccount: () => void;
	onToggleAdvanced: () => void;
	settingsDisabled: boolean;
}) {
	const hasAdvanced = Boolean(account);

	return (
		<>
			{account ? null : (
				<DestinationSection
					destination={destination}
					settingsDisabled={settingsDisabled}
				/>
			)}

			{account ? (
				<ExpanderRow
					label="Account"
					onToggle={onToggleAccount}
					open={accountOpen}
				/>
			) : null}

			{account && accountOpen ? (
				<UI.FieldGroup.Section>
					<UI.Row alignment="center" spacing={12}>
						<UI.Text>Nickname</UI.Text>
						<UI.Spacer flexible />
						<UI.Text numberOfLines={1} textStyle={SUBTLE_TEXT}>
							{account.name}
						</UI.Text>
					</UI.Row>
					<UI.Row alignment="center" spacing={12}>
						<UI.Text>Email</UI.Text>
						<UI.Spacer flexible />
						<UI.Text numberOfLines={1} textStyle={SUBTLE_TEXT}>
							{account.email}
						</UI.Text>
					</UI.Row>
					<UI.Button onPress={account.onSignOut} variant="text">
						<UI.Text textStyle={{ color: DESTRUCTIVE }}>Sign out</UI.Text>
					</UI.Button>
				</UI.FieldGroup.Section>
			) : null}

			{hasAdvanced ? (
				<ExpanderRow
					label="Advanced"
					onToggle={onToggleAdvanced}
					open={advancedOpen}
				/>
			) : null}

			{hasAdvanced && advancedOpen ? (
				<>
					{account && advanced.publishDevices.length > 0 ? (
						<UI.FieldGroup.Section title="Publishing devices">
							{advanced.publishDevices.map((device) => {
								const revealedUrl = advanced.revealedDeviceUrls[device.id];
								const origin =
									device.publishOrigin === "native"
										? "VISP Native"
										: device.publishOrigin === "web"
											? "Web"
											: "Legacy";
								return (
									<UI.Row alignment="center" key={device.id} spacing={12}>
										<UI.Column spacing={2}>
											<UI.Text>
												{device.nativeInstallationId === advanced.installationId
													? `${device.label} · This device`
													: device.label}
											</UI.Text>
											<UI.Text textStyle={SUBTLE_TEXT}>
												{`${origin} · ${device.publishing ? "Live" : "Offline"}`}
											</UI.Text>
											{revealedUrl ? (
												<UI.Text
													numberOfLines={3}
													textStyle={{ color: SUBTLE, fontSize: 11 }}
												>
													{revealedUrl}
												</UI.Text>
											) : null}
										</UI.Column>
										<UI.Spacer flexible />
										{device.publishRevealable && !revealedUrl ? (
											<UI.Button
												label="Reveal"
												onPress={() =>
													advanced.onRevealPublishDevice(device.id)
												}
												variant="text"
											/>
										) : null}
									</UI.Row>
								);
							})}
						</UI.FieldGroup.Section>
					) : null}

					{account && advanced.directOutputs ? (
						<UI.FieldGroup.Section title="Direct output">
							{advanced.directOutputs.betaEnabled ? (
								<>
									{advanced.directOutputs.providers.map((provider) => (
										<UI.Row
											alignment="center"
											key={provider.provider}
											spacing={12}
										>
											<UI.Column spacing={2}>
												<UI.Text>
													{provider.provider === "twitch" ? "Twitch" : "Kick"}
												</UI.Text>
												<UI.Text textStyle={SUBTLE_TEXT}>
													{provider.canReadStreamKey
														? "Authorized"
														: provider.linked
															? "Needs streaming permission"
															: "Not linked"}
												</UI.Text>
											</UI.Column>
											<UI.Spacer flexible />
											<UI.Button
												disabled={chatBusy}
												label={
													provider.canReadStreamKey
														? "Reauthorize"
														: "Authorize"
												}
												onPress={() =>
													advanced.onAuthorizeDirect(provider.provider)
												}
												variant="outlined"
											/>
										</UI.Row>
									))}
									{advanced.directOutputs.paths.map((path) => (
										<UI.Row alignment="center" key={path.id} spacing={12}>
											<UI.Column spacing={2}>
												<UI.Text>{path.label}</UI.Text>
												<UI.Text textStyle={SUBTLE_TEXT}>
													{path.publishing
														? "Live · stop to change outputs"
														: directStateSummary(path)}
												</UI.Text>
											</UI.Column>
											<UI.Spacer flexible />
											<UI.Picker
												enabled={!path.publishing}
												onValueChange={(selection) =>
													advanced.onApplyDirectSelection(
														path.id,
														String(selection),
													)
												}
												selectedValue={directSelectionOf(path)}
											>
												<UI.Picker.Item label="Off" value="off" />
												<UI.Picker.Item label="Twitch" value="twitch" />
												<UI.Picker.Item label="Kick" value="kick" />
												<UI.Picker.Item label="Both" value="both" />
											</UI.Picker>
										</UI.Row>
									))}
									<UI.FieldGroup.SectionFooter>
										<UI.Text textStyle={SUBTLE_TEXT}>
											{directWarning(advanced.directOutputs)}
										</UI.Text>
									</UI.FieldGroup.SectionFooter>
								</>
							) : (
								<UI.FieldGroup.SectionFooter>
									<UI.Text textStyle={SUBTLE_TEXT}>
										VISP Direct is in limited beta. It runs the platform encode
										on a single relay node, so access is handed out a few
										accounts at a time.
									</UI.Text>
								</UI.FieldGroup.SectionFooter>
							)}
						</UI.FieldGroup.Section>
					) : null}

					{account ? (
						<DestinationSection
							destination={destination}
							settingsDisabled={settingsDisabled}
						/>
					) : null}
				</>
			) : null}
		</>
	);
}
