import * as UI from "@expo/ui";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { type apiClient, serverOrigin } from "../lib/backend";
import { nativeDirectText } from "../lib/native-direct-i18n";
import { studioEditUrl } from "../lib/studio-link";
import {
	DEFAULT_PORTRAIT_CROP,
	DirectPortraitFraming,
	type PortraitCrop,
	type PortraitFramingDraft,
} from "./stream-settings-direct-framing";
import {
	DESTRUCTIVE,
	DIRECT_PROVIDERS,
	type DirectProvider,
	ProviderRow,
	providerLabel,
	SUBTLE_TEXT,
} from "./stream-settings-shared";

export type DirectOutputs = Awaited<
	ReturnType<typeof apiClient.direct.list.query>
>;
export type DirectPath = DirectOutputs["paths"][number];

export type BrbSettings = {
	defaultMessage: string;
	enabled: boolean;
	message: string;
};

export type DirectSettings = {
	brb?: BrbSettings;
	busy: boolean;
	directOutputs?: DirectOutputs;
	onApplyDirectSelection: (
		pathId: number,
		provider: DirectProvider,
		enabled: boolean,
	) => void;
	onAuthorizeDirect: (provider: DirectProvider) => void;
	onSaveDirectCrop: (
		pathId: number,
		provider: DirectProvider,
		crop: PortraitCrop,
	) => Promise<void>;
	onSetDirectRole: (
		pathId: number,
		provider: DirectProvider,
		role: "landscape" | "portrait",
	) => Promise<void>;
	previewUrl: string | null;
	onEndBrb: () => void;
	onUpdateBrb: (over: { enabled?: boolean; message?: string }) => void;
	onUpdateYoutubeTitle: (title: string) => void;
	publishPathId?: number;
};

/** Providers whose broadcast the relay is still holding up on the BRB card. */
export function brbHoldingProviders(path: DirectPath) {
	return DIRECT_PROVIDERS.filter((provider) => path.state[provider] === "brb");
}

export function directStateSummary(path: DirectPath) {
	const parts = DIRECT_PROVIDERS.flatMap((provider) => {
		const state = path.state[provider];
		if (!state) return [];
		return [`${providerLabel(provider)} ${path.error[provider] ?? state}`];
	});
	return parts.length > 0 ? parts.join(" · ") : "No direct output";
}

export function directWarning(outputs: DirectOutputs) {
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
	if (outputs.paths.some((path) => path.youtube)) {
		lines.push(
			"VISP creates a new public YouTube broadcast when publishing starts.",
		);
	}
	return lines.join("\n\n");
}

export function DirectPathSwitches({
	direct,
	path,
}: {
	direct: DirectSettings;
	path: DirectPath;
}) {
	return DIRECT_PROVIDERS.map((provider) => (
		<UI.Switch
			disabled={path.publishing}
			key={provider}
			label={providerLabel(provider)}
			value={path[provider]}
			onValueChange={(enabled) =>
				direct.onApplyDirectSelection(path.id, provider, enabled)
			}
		/>
	));
}

/**
 * The phone is the thing that drops, so it also has to be able to end a held
 * broadcast. Background choice stays on the dashboard: it needs an upload.
 */
export function BrbSection({ direct }: { direct: DirectSettings }) {
	const brb = direct.brb;
	const [message, setMessage] = useState(brb?.message ?? "");
	const messageInput = UI.useNativeState(message);
	useEffect(() => {
		if (brb) {
			setMessage(brb.message);
			messageInput.value = brb.message;
		}
	}, [brb, messageInput]);

	if (!brb) return null;
	const ownPath = direct.directOutputs?.paths.find(
		(path) => path.id === direct.publishPathId,
	);
	const holding = ownPath ? brbHoldingProviders(ownPath) : [];

	return (
		<UI.FieldGroup.Section title="Never drop again">
			<UI.Switch
				label="Show a BRB card when my stream drops"
				value={brb.enabled}
				onValueChange={(enabled) => direct.onUpdateBrb({ enabled })}
			/>
			{brb.enabled ? (
				<>
					<UI.TextInput
						maxLength={120}
						placeholder={brb.defaultMessage}
						value={messageInput}
						onChangeText={setMessage}
					/>
					<UI.Button
						disabled={message.trim() === brb.message.trim()}
						label="Save message"
						onPress={() => direct.onUpdateBrb({ message: message.trim() })}
						variant="outlined"
					/>
				</>
			) : null}
			{holding.length > 0 ? (
				<ProviderRow
					label="Your card is up"
					status={`${holding.map(providerLabel).join(" · ")} · go live again to come back`}
				>
					<UI.Button
						disabled={direct.busy}
						onPress={direct.onEndBrb}
						variant="outlined"
					>
						<UI.Text textStyle={{ color: DESTRUCTIVE }}>End broadcast</UI.Text>
					</UI.Button>
				</ProviderRow>
			) : null}
			<UI.FieldGroup.SectionFooter>
				<UI.Text textStyle={SUBTLE_TEXT}>
					When your ingest drops, VISP keeps the outgoing stream running and
					shows this card instead. Your hosts stay and the VOD does not split.
					Pick the background on the VISP dashboard.
				</UI.Text>
			</UI.FieldGroup.SectionFooter>
		</UI.FieldGroup.Section>
	);
}

export function DirectSection({ direct }: { direct: DirectSettings }) {
	const outputs = direct.directOutputs;
	const [youtubeTitle, setYoutubeTitle] = useState(
		outputs?.youtubeTitle ?? "Live from VISP",
	);
	const youtubeTitleInput = UI.useNativeState(youtubeTitle);
	const [framing, setFraming] = useState<PortraitFramingDraft>();
	const [savingCrop, setSavingCrop] = useState(false);
	const [addingPortrait, setAddingPortrait] = useState<DirectProvider>();
	useEffect(() => {
		if (outputs?.youtubeTitle) {
			setYoutubeTitle(outputs.youtubeTitle);
			youtubeTitleInput.value = outputs.youtubeTitle;
		}
	}, [outputs?.youtubeTitle, youtubeTitleInput]);

	if (!outputs) return null;
	// ponytail: no own path means a manual SRT URL or provisioning still in flight —
	// authorizing providers is still useful, toggling someone else's path is not.
	const ownPath = outputs.paths.find(
		(path) => path.id === direct.publishPathId,
	);

	return (
		<>
			<UI.FieldGroup.Section title="Stream to">
				{outputs.studio?.available ? (
					<ProviderRow
						label="Cloud Studio"
						status={
							outputs.studio.mode === "cloud_studio"
								? "Last saved program"
								: "OBS mode"
						}
					>
						<UI.Button
							label="Edit on web"
							onPress={() =>
								void Linking.openURL(studioEditUrl(serverOrigin()))
							}
							variant="outlined"
						/>
					</ProviderRow>
				) : null}
				{outputs.providers.map((provider) => (
					<ProviderRow
						key={provider.provider}
						label={providerLabel(provider.provider)}
						status={
							provider.canReadStreamKey
								? "Authorized"
								: provider.linked
									? "Needs streaming permission"
									: "Not linked"
						}
					>
						<UI.Button
							disabled={direct.busy}
							label={provider.canReadStreamKey ? "Reauthorize" : "Authorize"}
							onPress={() => direct.onAuthorizeDirect(provider.provider)}
							variant="outlined"
						/>
					</ProviderRow>
				))}
				{ownPath ? (
					<UI.Column spacing={8}>
						<UI.Text textStyle={SUBTLE_TEXT}>
							{ownPath.publishing
								? "Live · stop to change outputs"
								: directStateSummary(ownPath)}
						</UI.Text>
						<DirectPathSwitches direct={direct} path={ownPath} />
						{outputs.directDualOutput ? (
							<UI.Column spacing={8}>
								{outputs.destinations
									.filter(
										(destination) =>
											destination.pathId === ownPath.id &&
											destination.role === "portrait",
									)
									.map((destination) => (
										<ProviderRow
											key={destination.id}
											label={`${providerLabel(destination.provider)} · ${nativeDirectText("Portrait")}`}
											status={nativeDirectText(
												destination.error ?? destination.state ?? "Configured",
											)}
										>
											<UI.Button
												label={nativeDirectText("Edit framing")}
												variant="outlined"
												onPress={() =>
													setFraming({
														pathId: ownPath.id,
														provider: destination.provider,
														crop: destination.crop ?? DEFAULT_PORTRAIT_CROP,
													})
												}
											/>
											<UI.Button
												label={nativeDirectText("Remove")}
												variant="outlined"
												onPress={() =>
													void direct.onSetDirectRole(
														ownPath.id,
														destination.provider,
														"landscape",
													)
												}
											/>
										</ProviderRow>
									))}
								{outputs.providers
									.filter(
										(entry) =>
											entry.canReadStreamKey &&
											!ownPath[entry.provider] &&
											!outputs.destinations.some(
												(destination) =>
													destination.provider === entry.provider &&
													destination.role === "portrait",
											),
									)
									.map((entry) => (
										<UI.Button
											disabled={addingPortrait === entry.provider}
											key={entry.provider}
											label={`${nativeDirectText("Add portrait")} · ${providerLabel(entry.provider)}`}
											variant="outlined"
											onPress={() => {
												setAddingPortrait(entry.provider);
												void direct
													.onSetDirectRole(
														ownPath.id,
														entry.provider,
														"portrait",
													)
													.then(() =>
														setFraming({
															pathId: ownPath.id,
															provider: entry.provider,
															crop: DEFAULT_PORTRAIT_CROP,
														}),
													)
													.finally(() => setAddingPortrait(undefined));
											}}
										/>
									))}
							</UI.Column>
						) : null}
					</UI.Column>
				) : null}
				{ownPath?.youtube ? (
					<>
						<UI.TextInput
							maxLength={100}
							placeholder="YouTube broadcast title"
							value={youtubeTitleInput}
							onChangeText={setYoutubeTitle}
						/>
						<UI.Button
							disabled={!youtubeTitle.trim()}
							label="Save YouTube title"
							onPress={() => direct.onUpdateYoutubeTitle(youtubeTitle.trim())}
							variant="outlined"
						/>
					</>
				) : null}
				<UI.FieldGroup.SectionFooter>
					<UI.Text textStyle={SUBTLE_TEXT}>{directWarning(outputs)}</UI.Text>
				</UI.FieldGroup.SectionFooter>
			</UI.FieldGroup.Section>
			<UI.BottomSheet
				isPresented={Boolean(framing)}
				onDismiss={() => setFraming(undefined)}
				snapPoints={["full"]}
			>
				{framing ? (
					<DirectPortraitFraming
						draft={framing}
						previewUrl={direct.previewUrl}
						saving={savingCrop}
						onCancel={() => setFraming(undefined)}
						onChange={setFraming}
						onSave={async () => {
							setSavingCrop(true);
							try {
								await direct.onSaveDirectCrop(
									framing.pathId,
									framing.provider,
									framing.crop,
								);
								setFraming(undefined);
							} finally {
								setSavingCrop(false);
							}
						}}
					/>
				) : null}
			</UI.BottomSheet>
		</>
	);
}
