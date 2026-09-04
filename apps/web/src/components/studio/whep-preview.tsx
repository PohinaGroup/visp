import { Button } from "@astryxdesign/core/Button";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

export function buildWhepRequest(url: string, sdp?: string) {
	const target = new URL(url);
	const user = target.searchParams.get("user");
	const pass = target.searchParams.get("pass");
	target.searchParams.delete("user");
	target.searchParams.delete("pass");
	return {
		url: target.toString(),
		init: {
			method: "POST",
			headers: {
				"Content-Type": "application/sdp",
				...(user !== null && pass !== null
					? { Authorization: `Basic ${btoa(`${user}:${pass}`)}` }
					: {}),
			},
			body: sdp,
		},
	};
}

/**
 * A live WHEP pane. It never renders a bare black rectangle: whenever there is
 * no picture it says which state it is in and what the viewer can do next.
 */
export function WhepPreview({
	emptyHint,
	emptyTitle,
	label,
	poster,
	url,
}: {
	emptyHint?: string;
	emptyTitle: string;
	label: string;
	poster?: string;
	url?: string;
}) {
	const t = useT();
	const video = useRef<HTMLVideoElement>(null);
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<"idle" | "loading" | "playing" | "error">(
		"idle",
	);
	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is a nonce — bumping it reconnects
	useEffect(() => {
		if (!url || typeof RTCPeerConnection === "undefined") {
			setState("idle");
			return;
		}
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
				const request = buildWhepRequest(url, peer.localDescription?.sdp);
				const response = await fetch(request.url, request.init);
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
	}, [url, attempt]);

	const overlay =
		!url || state === "idle"
			? { title: emptyTitle, hint: emptyHint, canRetry: false }
			: state === "loading"
				? {
						title: t("Connecting to the stream…"),
						hint: t("This usually takes a few seconds."),
						canRetry: false,
					}
				: state === "error"
					? {
							title: t("Preview could not connect"),
							hint: t(
								"The stream is still going out. Only this browser preview failed — check your network, then retry.",
							),
							canRetry: true,
						}
					: null;

	return (
		<div style={{ position: "relative", width: "100%" }}>
			<video
				aria-label={label}
				autoPlay
				muted
				playsInline
				poster={poster}
				ref={video}
				style={{
					aspectRatio: "16 / 9",
					background: "var(--color-neutral, #0b0f19)",
					display: "block",
					width: "100%",
				}}
			/>
			{overlay ? (
				<div
					role="status"
					style={{
						alignItems: "center",
						display: "flex",
						flexDirection: "column",
						gap: "0.5rem",
						inset: 0,
						justifyContent: "center",
						padding: "1rem",
						position: "absolute",
						textAlign: "center",
					}}
				>
					{state === "loading" ? (
						<Spinner label={t("Loading preview…")} />
					) : null}
					<Text type="label">{overlay.title}</Text>
					{overlay.hint ? (
						<Text color="secondary" type="supporting">
							{overlay.hint}
						</Text>
					) : null}
					{overlay.canRetry ? (
						<Button
							label={t("Retry preview")}
							size="sm"
							variant="secondary"
							onClick={() => setAttempt((value) => value + 1)}
						/>
					) : null}
				</div>
			) : null}
		</div>
	);
}
