import { Text } from "@astryxdesign/core/Text";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

export function WhepPreview({
	label,
	poster,
	url,
}: {
	label: string;
	poster?: string;
	url?: string;
}) {
	const t = useT();
	const video = useRef<HTMLVideoElement>(null);
	const [state, setState] = useState<"idle" | "loading" | "playing" | "error">(
		"idle",
	);
	useEffect(() => {
		if (!url || typeof RTCPeerConnection === "undefined") return;
		const peer = new RTCPeerConnection();
		let cancelled = false;
		setState("loading");
		peer.addTransceiver("video", { direction: "recvonly" });
		peer.addTransceiver("audio", { direction: "recvonly" });
		peer.ontrack = ({ streams }) => {
			if (video.current && streams[0]) video.current.srcObject = streams[0];
			if (!cancelled) setState("playing");
		};
		peer.onconnectionstatechange = () => {
			if (
				!cancelled &&
				["failed", "disconnected"].includes(peer.connectionState)
			)
				setState("error");
		};
		void (async () => {
			try {
				await peer.setLocalDescription(await peer.createOffer());
				await new Promise<void>((resolve) => {
					if (peer.iceGatheringState === "complete") return resolve();
					peer.addEventListener("icegatheringstatechange", () => {
						if (peer.iceGatheringState === "complete") resolve();
					});
				});
				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/sdp" },
					body: peer.localDescription?.sdp,
				});
				if (!response.ok) throw new Error("preview unavailable");
				await peer.setRemoteDescription({
					type: "answer",
					sdp: await response.text(),
				});
			} catch {
				if (!cancelled) setState("error");
			}
		})();
		return () => {
			cancelled = true;
			peer.close();
			if (video.current) video.current.srcObject = null;
		};
	}, [url]);
	return (
		<>
			<video
				aria-label={label}
				autoPlay
				muted
				playsInline
				poster={poster}
				ref={video}
				style={{ aspectRatio: "16 / 9", background: "black", width: "100%" }}
			/>
			<Text role="status">
				{!url || state === "idle"
					? t("Preview unavailable")
					: state === "loading"
						? t("Loading preview…")
						: state === "error"
							? t("Preview failed")
							: ""}
			</Text>
		</>
	);
}
