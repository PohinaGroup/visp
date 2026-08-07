import type { ChatMessage } from "@VISP/api/chat/contract";
import type { FloatingPosition } from "../lib/chat-model";
import { visibleChatMessages } from "../lib/chat-model";
import { useChatFadeClock } from "../lib/use-chat-fade-clock";
import { FloatingChat } from "./floating-chat";

export function FloatingChatLayer({
	disappearingMessages,
	messages,
	onPositionChange,
	position,
}: {
	disappearingMessages: boolean;
	messages: Array<ChatMessage & { receivedAt: number }>;
	onPositionChange: (position: FloatingPosition) => void;
	position: FloatingPosition;
}) {
	const newestReceivedAt = messages.at(-1)?.receivedAt ?? 0;
	const now = useChatFadeClock(true, disappearingMessages, newestReceivedAt);
	const visible = visibleChatMessages(messages, disappearingMessages, now);
	return (
		<FloatingChat
			messages={visible}
			onPositionChange={onPositionChange}
			position={position}
		/>
	);
}
