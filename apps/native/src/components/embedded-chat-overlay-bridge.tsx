import type { ChatMessage } from "@VISP/api/chat/contract";
import type { RefObject } from "react";
import type { VispSrtViewRef } from "../../modules/visp-srt";
import type { ChatCorner } from "../lib/chat-model";
import { visibleChatMessages } from "../lib/chat-model";
import { useChatFadeClock } from "../lib/use-chat-fade-clock";
import { useEmbeddedChatOverlay } from "../lib/use-embedded-chat-overlay";

export function EmbeddedChatOverlayBridge({
	cameraRef,
	corner,
	disappearingMessages,
	enabled,
	messages,
}: {
	cameraRef: RefObject<VispSrtViewRef | null>;
	corner: ChatCorner;
	disappearingMessages: boolean;
	enabled: boolean;
	messages: Array<ChatMessage & { receivedAt: number }>;
}) {
	const newestReceivedAt = messages.at(-1)?.receivedAt ?? 0;
	const now = useChatFadeClock(enabled, disappearingMessages, newestReceivedAt);
	const visible = visibleChatMessages(messages, disappearingMessages, now);
	useEmbeddedChatOverlay(cameraRef, enabled, visible, corner);
	return null;
}
