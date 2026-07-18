import type { ChatMessage, ChatProviderStatus } from "@VISP/api/chat/contract";
import type { StreamState, VideoConfiguration } from "../../modules/visp-srt";
import type { AudioTier } from "./audio-level";

export type WatchSnapshot = {
	version: 1;
	updatedAt: number;
	stream: {
		state: StreamState;
		liveStartedAt?: number;
		audioTier: AudioTier;
		width?: number;
		height?: number;
		fps?: number;
		message?: string;
		reconnectAttempt?: number;
	};
	chat: {
		statuses: Partial<Record<"twitch" | "kick", ChatProviderStatus["state"]>>;
		messages: Array<{
			id: string;
			provider: "twitch" | "kick";
			senderName: string;
			senderColor?: string;
			text: string;
		}>;
	};
};

export function buildWatchSnapshot({
	audioTier,
	configuration,
	liveStartedAt,
	message,
	messages,
	reconnectAttempt,
	state,
	statuses,
	updatedAt = Date.now(),
}: {
	audioTier: AudioTier;
	configuration?: VideoConfiguration;
	liveStartedAt?: number;
	message?: string;
	messages: ChatMessage[];
	reconnectAttempt?: number;
	state: StreamState;
	statuses: Partial<Record<"twitch" | "kick", ChatProviderStatus["state"]>>;
	updatedAt?: number;
}): WatchSnapshot {
	return {
		version: 1,
		updatedAt,
		stream: {
			state,
			liveStartedAt,
			audioTier,
			width: configuration?.width,
			height: configuration?.height,
			fps: configuration?.fps,
			message,
			reconnectAttempt,
		},
		chat: {
			statuses,
			messages: messages.slice(-4).map((chatMessage) => ({
				id: chatMessage.id,
				provider: chatMessage.provider,
				senderName: chatMessage.sender.name,
				senderColor: chatMessage.sender.color,
				text: chatMessage.fragments.map((fragment) => fragment.text).join(""),
			})),
		},
	};
}
