import * as UI from "@expo/ui";
import type { BondingMode } from "../../modules/visp-srt";
import type { apiClient } from "../lib/backend";
import {
	DirectPathSwitches,
	type DirectSettings,
	directStateSummary,
} from "./stream-settings-direct-section";
import {
	DESTRUCTIVE,
	DestinationSection,
	type DestinationSettings,
	ExpanderRow,
	ProviderRow,
	providerLabel,
	SUBTLE,
	SUBTLE_TEXT,
} from "./stream-settings-shared";

type PublishDevices = Awaited<ReturnType<typeof apiClient.paths.list.query>>;
type LinkedAccounts = Awaited<
	ReturnType<typeof apiClient.channel.linkedAccounts.query>
>;

export type AccountSettings = {
	email: string;
	linkedAccounts?: LinkedAccounts;
	name: string;
	onSignOut: () => void;
};

function linkedIdentity(entry: LinkedAccounts[number]) {
	const identity = [entry.name, entry.email].filter(Boolean).join(" · ");
	if (identity) return identity;
	return entry.accountId ? `ID ${entry.accountId}` : "Linked";
}

function linkedStatus(entry: LinkedAccounts[number]) {
	if (!entry.linked) return "Not linked";
	if (entry.status === "reauthorize")
		return `${linkedIdentity(entry)} · re-authorize to restore access`;
	if (entry.status === "unreachable")
		return `${linkedIdentity(entry)} · provider unreachable`;
	const grants = [
		entry.canChat && "chat",
		entry.canManageChannel && "stream info",
		entry.canReadStreamKey && "direct output",
	].filter(Boolean);
	return `${linkedIdentity(entry)}\n${grants.length > 0 ? `Allows ${grants.join(", ")}` : "No permissions granted"}`;
}

export type AdvancedSettings = {
	installationId?: string;
	onRevealPublishDevice: (pathId: number) => void;
	publishDevices: PublishDevices;
	revealedDeviceUrls: Record<number, string>;
};

export type NetworkSettings = {
	bondingMode: BondingMode;
	onUpdateBondingMode: (mode: BondingMode) => Promise<void>;
};

export function AdvancedSection({
	account,
	accountOpen,
	advanced,
	advancedOpen,
	destination,
	direct,
	onToggleAccount,
	onToggleAdvanced,
	settingsDisabled,
}: {
	account?: AccountSettings;
	accountOpen: boolean;
	advanced: AdvancedSettings;
	advancedOpen: boolean;
	destination: DestinationSettings;
	direct: DirectSettings;
	onToggleAccount: () => void;
	onToggleAdvanced: () => void;
	settingsDisabled: boolean;
}) {
	const hasAdvanced = Boolean(account);
	const otherPaths =
		direct.directOutputs?.paths.filter(
			(path) => path.id !== direct.publishPathId,
		) ?? [];

	return (
		<>
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

			{account && accountOpen ? (
				<UI.FieldGroup.Section title="Linked platforms">
					{account.linkedAccounts ? (
						account.linkedAccounts.map((entry) => (
							<ProviderRow
								key={entry.provider}
								label={providerLabel(entry.provider)}
								status={linkedStatus(entry)}
							/>
						))
					) : (
						<UI.Text textStyle={SUBTLE_TEXT}>
							Reading platform accounts…
						</UI.Text>
					)}
					<UI.FieldGroup.SectionFooter>
						<UI.Text textStyle={SUBTLE_TEXT}>
							Names and emails come from each platform. Link or unlink them in
							Chat and Direct.
						</UI.Text>
					</UI.FieldGroup.SectionFooter>
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
					<DestinationSection
						destination={destination}
						settingsDisabled={settingsDisabled}
					/>
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

					{otherPaths.length > 0 ? (
						<UI.FieldGroup.Section title="Other sources">
							{otherPaths.map((path) => (
								<UI.Column key={path.id} spacing={8}>
									<UI.Column spacing={2}>
										<UI.Text>{path.label}</UI.Text>
										<UI.Text textStyle={SUBTLE_TEXT}>
											{path.publishing
												? "Live · stop to change outputs"
												: directStateSummary(path)}
										</UI.Text>
									</UI.Column>
									<DirectPathSwitches direct={direct} path={path} />
								</UI.Column>
							))}
							<UI.FieldGroup.SectionFooter>
								<UI.Text textStyle={SUBTLE_TEXT}>
									Direct outputs for your other publishing sources, such as OBS
									or another device.
								</UI.Text>
							</UI.FieldGroup.SectionFooter>
						</UI.FieldGroup.Section>
					) : null}
				</>
			) : null}
		</>
	);
}
