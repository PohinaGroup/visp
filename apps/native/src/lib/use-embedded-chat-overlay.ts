import { useEffect, useRef } from "react";
import type { VispSrtViewRef } from "../../modules/visp-srt";
import type { ChatCorner, VisibleChatMessage } from "./chat-model";

const OPACITY_THROTTLE_MS = 500;

function contentKey(messages: VisibleChatMessage[]) {
	return JSON.stringify(
		messages.map((message) => ({
			id: message.id,
			provider: message.provider,
			fragments: message.fragments,
			sender: message.sender,
		})),
	);
}

function overlayKey(messages: VisibleChatMessage[]) {
	return JSON.stringify(
		messages.map((message) => ({
			id: message.id,
			opacity: Math.round(message.opacity * 10) / 10,
		})),
	);
}

/**
 * Pushes embedded chat to the native video overlay without re-rendering the
 * stream screen on every opacity tick. Content changes go through immediately;
 * fade-only updates are throttled because each call redraws a bitmap and may
 * refetch emote/badge images.
 */
export function useEmbeddedChatOverlay(
	cameraRef: React.RefObject<VispSrtViewRef | null>,
	enabled: boolean,
	messages: VisibleChatMessage[],
	corner: ChatCorner,
) {
	const lastContentRef = useRef("");
	const lastOverlayRef = useRef("");
	const lastPushAtRef = useRef(0);

	useEffect(() => {
		if (!enabled) {
			lastContentRef.current = "";
			lastOverlayRef.current = "";
			void cameraRef.current?.clearChatOverlay().catch(() => undefined);
			return;
		}

		const content = contentKey(messages);
		const overlay = overlayKey(messages);
		if (overlay === lastOverlayRef.current) {
			return;
		}

		const contentChanged = content !== lastContentRef.current;
		const now = Date.now();
		if (!contentChanged && now - lastPushAtRef.current < OPACITY_THROTTLE_MS) {
			return;
		}

		lastContentRef.current = content;
		lastOverlayRef.current = overlay;
		lastPushAtRef.current = now;
		void cameraRef.current
			?.updateChatOverlay(messages, corner)
			.catch(() => undefined);
	}, [cameraRef, corner, enabled, messages]);
}
