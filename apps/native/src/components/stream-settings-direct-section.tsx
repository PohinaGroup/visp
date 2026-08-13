import * as UI from "@expo/ui";
import { useEffect, useState } from "react";
import type { apiClient } from "../lib/backend";
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
		<UI.FieldGroup.Section title="Stream to">
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
	);
}
