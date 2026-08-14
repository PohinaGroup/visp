import type { ChatProvider } from "@VISP/api/chat/contract";
import { linkScopes, PROVIDER_SCOPES } from "@VISP/api/scopes";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useState } from "react";
import { apiClient, authCallbackURL, authClient } from "./backend";
import {
	type ChatPreferences,
	DEFAULT_CHAT_PREFERENCES,
	loadChatPreferences,
	saveChatPreferences,
} from "./chat-preferences";
import { IS_WEB } from "./platform";
import {
	deleteStreamUrl,
	loadOrCreateInstallationId,
	loadStreamUrl,
	streamOwnerId,
} from "./stream-url";
import { usePublishProvisioning } from "./use-publish-provisioning";

export function useStreamAccount({
	sessionPending,
	setMessage,
	showToast,
	userId,
}: {
	sessionPending: boolean;
	setMessage: Dispatch<SetStateAction<string | undefined>>;
	showToast: (text: string, spinning?: boolean) => void;
	userId?: string;
}) {
	const [streamUrl, setStreamUrl] = useState<string | null>();
	const [chatPreferences, setChatPreferences] = useState<ChatPreferences>(
		DEFAULT_CHAT_PREFERENCES,
	);
	const [chatConnections, setChatConnections] = useState<
		Awaited<ReturnType<typeof apiClient.chat.connections.list.query>>
	>([]);
	const [publishDevices, setPublishDevices] = useState<
		Awaited<ReturnType<typeof apiClient.paths.list.query>>
	>([]);
	const [directOutputs, setDirectOutputs] =
		useState<Awaited<ReturnType<typeof apiClient.direct.list.query>>>();
	const [brb, setBrb] =
		useState<Awaited<ReturnType<typeof apiClient.brb.get.query>>>();
	const [linkedAccounts, setLinkedAccounts] =
		useState<
			Awaited<ReturnType<typeof apiClient.channel.linkedAccounts.query>>
		>();
	const [installationId, setInstallationId] = useState<string>();
	const [revealedDeviceUrls, setRevealedDeviceUrls] = useState<
		Record<number, string>
	>({});
	const [chatBusy, setChatBusy] = useState<"twitch" | "kick" | "youtube">();
	const streamOwner = streamOwnerId(userId);

	useEffect(() => {
		if (sessionPending) return;
		setStreamUrl(undefined);
		void (async () => {
			const url = await loadStreamUrl(streamOwner);
			if (!url && userId) {
				await deleteStreamUrl().catch(() => {});
			}
			setStreamUrl(url);
		})().catch(() => {
			setStreamUrl(null);
			setMessage("The saved SRT destination could not be read.");
		});
	}, [sessionPending, setMessage, streamOwner, userId]);

	useEffect(() => {
		if (!userId) {
			setChatPreferences(DEFAULT_CHAT_PREFERENCES);
			setChatConnections([]);
			setPublishDevices([]);
			setLinkedAccounts(undefined);
			setInstallationId(undefined);
			setBrb(undefined);
			return;
		}
		loadChatPreferences(userId)
			.then((preferences) =>
				setChatPreferences(
					IS_WEB && preferences.mode === "embedded"
						? { ...preferences, mode: "floating" }
						: preferences,
				),
			)
			.catch(() => setChatPreferences(DEFAULT_CHAT_PREFERENCES));
		apiClient.chat.connections.list
			.query()
			.then(setChatConnections)
			.catch(() => setChatConnections([]));
		apiClient.paths.list
			.query()
			.then(setPublishDevices)
			.catch(() => setPublishDevices([]));
		apiClient.brb.get
			.query()
			.then(setBrb)
			.catch(() => setBrb(undefined));
		loadOrCreateInstallationId()
			.then(setInstallationId)
			.catch(() => setMessage("This installation could not be identified."));
	}, [setMessage, userId]);

	const updateChatPreferences = useCallback(
		(updater: (current: ChatPreferences) => ChatPreferences) => {
			setChatPreferences((current) => {
				const next = updater(current);
				if (userId)
					void saveChatPreferences(userId, next).catch(() => undefined);
				return next;
			});
		},
		[userId],
	);

	const refreshChatConnections = useCallback(async () => {
		if (!userId) return;
		setChatConnections(await apiClient.chat.connections.list.query());
	}, [userId]);

	const refreshPublishDevices = useCallback(async () => {
		if (!userId) return;
		setPublishDevices(await apiClient.paths.list.query());
	}, [userId]);

	const refreshDirectOutputs = useCallback(async () => {
		if (!userId) return;
		setDirectOutputs(await apiClient.direct.list.query());
	}, [userId]);

	const updateBrb = useCallback(
		async (over: { enabled?: boolean; message?: string }) => {
			if (!brb) return;
			const next = { ...brb, ...over };
			setBrb(next);
			try {
				await apiClient.brb.update.mutate({
					enabled: next.enabled,
					message: next.message,
					// The phone edits the switch and the message; the background
					// picker, which needs an image upload, stays on the dashboard.
					source: next.source,
				});
			} catch (error) {
				setBrb(brb);
				showToast(
					error instanceof Error
						? error.message
						: "The BRB card could not be saved",
				);
			}
		},
		[brb, showToast],
	);

	/** Ends a broadcast the relay is still holding up on the BRB card. */
	const endBrb = useCallback(
		async (pathId: number) => {
			try {
				await apiClient.brb.stop.mutate({ pathId });
				await refreshDirectOutputs();
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "The broadcast could not be ended",
				);
			}
		},
		[refreshDirectOutputs, showToast],
	);

	// Each call reads every linked provider's profile live, so it runs on demand
	// (opening Account, or after a link changes) rather than on every load.
	const refreshLinkedAccounts = useCallback(async () => {
		if (!userId) return;
		try {
			setLinkedAccounts(await apiClient.channel.linkedAccounts.query());
		} catch {
			setLinkedAccounts([]);
		}
	}, [userId]);

	const { awaitingAutoProvision, provisionDestination, provisioning } =
		usePublishProvisioning({
			installationId,
			refreshPublishDevices,
			sessionPending,
			setMessage,
			setStreamUrl,
			streamOwner,
			streamUrl,
			userId,
		});

	const applyDirectSelection = useCallback(
		async (
			pathId: number,
			provider: "twitch" | "kick" | "youtube",
			enabled: boolean,
		) => {
			const path = directOutputs?.paths.find((entry) => entry.id === pathId);
			if (!path) return;
			try {
				await apiClient.direct.setOutputs.mutate({
					pathId,
					twitch: provider === "twitch" ? enabled : path.twitch,
					kick: provider === "kick" ? enabled : path.kick,
					youtube: provider === "youtube" ? enabled : path.youtube,
				});
				await Promise.all([refreshDirectOutputs(), refreshPublishDevices()]);
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Direct output could not be saved",
				);
			}
		},
		[
			directOutputs?.paths,
			refreshDirectOutputs,
			refreshPublishDevices,
			showToast,
		],
	);

	const updateYoutubeTitle = useCallback(
		async (title: string) => {
			try {
				await apiClient.direct.setYoutubeSettings.mutate({ title });
				await refreshDirectOutputs();
				showToast("YouTube title saved");
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "YouTube title could not be saved",
				);
			}
		},
		[refreshDirectOutputs, showToast],
	);

	const revealPublishDevice = useCallback(
		async (pathId: number) => {
			try {
				const device = await apiClient.paths.reveal.mutate({ pathId });
				setRevealedDeviceUrls((current) => ({
					...current,
					[pathId]: device.urls.srt,
				}));
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Publish URL could not be revealed",
				);
			}
		},
		[showToast],
	);

	const linkProvider = useCallback(
		async (
			provider: "twitch" | "kick" | "youtube",
			adding: readonly string[] = [],
		) => {
			setChatBusy(provider);
			try {
				const granted =
					(provider === "youtube"
						? directOutputs?.providers.find(
								(entry) => entry.provider === provider,
							)?.grantedScopes
						: chatConnections.find((entry) => entry.provider === provider)
								?.grantedScopes) ?? [];
				const scopes = linkScopes(provider, granted, adding);
				const result =
					provider !== "kick"
						? await authClient.linkSocial({
								provider: provider === "youtube" ? "google" : provider,
								callbackURL: authCallbackURL(),
								errorCallbackURL: authCallbackURL(),
								scopes,
							})
						: await authClient.oauth2.link({
								providerId: provider,
								callbackURL: authCallbackURL(),
								errorCallbackURL: authCallbackURL(),
								scopes,
							});
				if (result.error)
					throw new Error(result.error.message ?? `Could not link ${provider}`);
				await Promise.all([
					refreshChatConnections(),
					refreshDirectOutputs(),
					refreshLinkedAccounts(),
				]);
				return true;
			} catch (error) {
				showToast(
					error instanceof Error ? error.message : `Could not link ${provider}`,
				);
				return false;
			} finally {
				setChatBusy(undefined);
			}
		},
		[
			chatConnections,
			directOutputs?.providers,
			refreshChatConnections,
			refreshDirectOutputs,
			refreshLinkedAccounts,
			showToast,
		],
	);

	const linkChatProvider = useCallback(
		(provider: ChatProvider, chatConsent = false) =>
			linkProvider(provider, chatConsent ? PROVIDER_SCOPES[provider].chat : []),
		[linkProvider],
	);

	/**
	 * Editing stream info needs channel write, which only Twitch's chat scope
	 * happens to include — YouTube's grants read-only access.
	 */
	const linkChannelProvider = useCallback(
		(provider: ChatProvider) =>
			linkProvider(provider, [PROVIDER_SCOPES[provider].channelWrite]),
		[linkProvider],
	);

	const toggleChatConnection = useCallback(
		async (connection: (typeof chatConnections)[number]) => {
			if (!connection.linked) {
				await linkChatProvider(connection.provider);
				return;
			}
			if (connection.needsConsent) {
				await linkChatProvider(connection.provider, true);
				return;
			}
			setChatBusy(connection.provider);
			try {
				if (connection.enabled) {
					await apiClient.chat.connections.disable.mutate({
						provider: connection.provider,
					});
				} else {
					await apiClient.chat.connections.enable.mutate({
						provider: connection.provider,
					});
				}
				await refreshChatConnections();
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Chat connection could not be changed",
				);
			} finally {
				setChatBusy(undefined);
			}
		},
		[linkChatProvider, refreshChatConnections, showToast],
	);

	const reauthorizeChatProvider = useCallback(
		async (connection: (typeof chatConnections)[number]) => {
			await linkChatProvider(connection.provider, true);
		},
		[linkChatProvider],
	);

	const authorizeAlertProvider = useCallback(
		async (connection: (typeof chatConnections)[number]) => {
			const linked = await linkProvider(connection.provider, [
				...PROVIDER_SCOPES[connection.provider].alerts,
				...(connection.needsConsent
					? PROVIDER_SCOPES[connection.provider].chat
					: []),
			]);
			if (!linked || !connection.enabled) return;
			try {
				await apiClient.chat.connections.enable.mutate({
					provider: connection.provider,
				});
				await refreshChatConnections();
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Alert authorization could not be applied",
				);
			}
		},
		[linkProvider, refreshChatConnections, showToast],
	);

	const unlinkChatProvider = useCallback(
		async (connection: (typeof chatConnections)[number]) => {
			setChatBusy(connection.provider);
			try {
				if (connection.enabled) {
					await apiClient.chat.connections.disable.mutate({
						provider: connection.provider,
					});
				}
				const result = await authClient.unlinkAccount({
					providerId:
						connection.provider === "youtube" ? "google" : connection.provider,
				});
				if (result.error)
					throw new Error(
						result.error.message ?? "Provider could not be unlinked",
					);
				await Promise.all([refreshChatConnections(), refreshLinkedAccounts()]);
			} catch (error) {
				showToast(
					error instanceof Error
						? error.message
						: "Chat connection could not be unlinked",
				);
			} finally {
				setChatBusy(undefined);
			}
		},
		[refreshChatConnections, refreshLinkedAccounts, showToast],
	);

	return {
		applyDirectSelection,
		authorizeAlertProvider,
		awaitingAutoProvision,
		brb,
		chatBusy,
		chatConnections,
		chatPreferences,
		directOutputs,
		endBrb,
		installationId,
		linkChannelProvider,
		linkChatProvider,
		linkedAccounts,
		linkProvider,
		provisionDestination,
		provisioning,
		publishDevices,
		refreshChatConnections,
		refreshDirectOutputs,
		refreshLinkedAccounts,
		refreshPublishDevices,
		revealedDeviceUrls,
		revealPublishDevice,
		setStreamUrl,
		streamUrl,
		reauthorizeChatProvider,
		toggleChatConnection,
		unlinkChatProvider,
		updateBrb,
		updateChatPreferences,
		updateYoutubeTitle,
	};
}
