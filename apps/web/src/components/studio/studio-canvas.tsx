import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
	browserSourceUrlError,
	draggedLayerPosition,
	type StudioLayer,
	type StudioScene,
	studioLayerDisplayState,
} from "@/lib/studio-model";
import { useTRPC } from "@/utils/trpc";

const FRAME_WIDTH = 1920;
const FRAME_HEIGHT = 1080;
const NUDGE_STEP = 10;
const NUDGE_FINE_STEP = 1;

const NUDGE: Record<string, readonly [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

function PngLayerImage({ assetId, name }: { assetId: string; name: string }) {
	const trpc = useTRPC();
	// ponytail: presigned URL lives 120s; the <img> only needs it once, and a
	// refetch on focus covers long-open tabs. Add polling if that stops holding.
	const asset = useQuery(
		trpc.studio.assetUrl.queryOptions({ assetId }, { staleTime: 60_000 }),
	);
	const t = useT();
	return asset.data?.url ? (
		<img
			alt={name}
			src={asset.data.url}
			style={{ height: "100%", objectFit: "contain", width: "100%" }}
		/>
	) : (
		<span style={{ fontSize: "2.5cqh", opacity: 0.7 }}>
			{asset.isError ? t("PNG could not be loaded") : t("PNG overlay")}
		</span>
	);
}

/**
 * The page itself, rendered at frame resolution and scaled into the canvas, so
 * text on the widget is the size it will be on air. Sandboxed and click-through
 * — this is a preview, not a browser.
 */
function BrowserLayerFrame({
	height,
	scale,
	url,
	width,
}: {
	height: number;
	scale: number;
	url: string;
	width: number;
}) {
	const t = useT();
	const valid = browserSourceUrlError(url) === null;
	const [loaded, setLoaded] = useState(valid ? url : "");
	useEffect(() => {
		if (!valid) return;
		// Typing an address changes it on every keystroke; only load once it settles.
		const timer = setTimeout(() => setLoaded(url), 600);
		return () => clearTimeout(timer);
	}, [url, valid]);
	if (!valid || !loaded)
		return (
			<span
				style={{ fontSize: "2.6cqh", opacity: 0.85, wordBreak: "break-all" }}
			>
				{t("Browser source")}
				<br />
				{url}
			</span>
		);
	return (
		<iframe
			// Widget hosts that gate on Referer see visp-stream.com; the path,
			// which is the only part worth hiding, never leaves.
			referrerPolicy="strict-origin"
			sandbox="allow-scripts"
			src={loaded}
			style={{
				border: 0,
				height,
				// Absolute so the parent's flex centring can't offset the scaled box:
				// the page renders at frame size and shrinks onto the layer exactly.
				left: 0,
				pointerEvents: "none",
				position: "absolute",
				top: 0,
				transform: `scale(${scale})`,
				transformOrigin: "top left",
				width,
			}}
			title={t("Browser source")}
		/>
	);
}

function LayerBody({ layer, scale }: { layer: StudioLayer; scale: number }) {
	const t = useT();
	switch (layer.type) {
		case "text":
			return (
				<span
					style={{
						fontSize: "5cqh",
						fontWeight: 600,
						lineHeight: 1.2,
						overflow: "hidden",
						textShadow: "0 1px 3px rgba(0,0,0,0.85)",
						width: "100%",
					}}
				>
					{layer.text || t("Empty text")}
				</span>
			);
		case "png":
			return <PngLayerImage assetId={layer.assetId} name={layer.name} />;
		case "browser":
			return (
				<BrowserLayerFrame
					height={layer.height}
					scale={scale}
					url={layer.url}
					width={layer.width}
				/>
			);
		default:
			return (
				<span style={{ fontSize: "2.6cqh", opacity: 0.85 }}>
					{t("VISP alert")} · {t(layer.event)}
					<br />
					{t("Shows only when the event fires")}
				</span>
			);
	}
}

/**
 * What the composition actually looks like, at frame scale. This is the preview
 * that works with no stream running — every source is drawn, not boxed — and
 * sources move by dragging or with the arrow keys.
 */
export function StudioCanvas({
	blockedLayerIds,
	readOnly,
	scene,
	selectedLayerId,
	onMove,
	onSelect,
}: {
	blockedLayerIds: string[];
	readOnly: boolean;
	scene: StudioScene;
	selectedLayerId?: string;
	onMove: (layerId: string, x: number, y: number) => void;
	onSelect: (layerId: string) => void;
}) {
	const t = useT();
	const frame = useRef<HTMLElement>(null);
	const drag = useRef<{
		originX: number;
		originY: number;
		pointerId: number;
		startX: number;
		startY: number;
	} | null>(null);
	const [frameWidth, setFrameWidth] = useState(0);
	useEffect(() => {
		const node = frame.current;
		if (!node || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) =>
			setFrameWidth(entry?.contentRect.width ?? 0),
		);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	// Frame pixels to rendered pixels. Zero until measured, which disables drag.
	const scale = frameWidth / FRAME_WIDTH;

	return (
		<section
			aria-label={t("Composition preview")}
			ref={frame}
			style={{
				aspectRatio: "16 / 9",
				background:
					"repeating-linear-gradient(45deg, #131a26 0 12px, #172032 12px 24px)",
				containerType: "size",
				overflow: "hidden",
				position: "relative",
				width: "100%",
			}}
		>
			<span
				style={{
					bottom: "2%",
					color: "rgba(226,232,240,0.55)",
					fontSize: "2.4cqh",
					left: "2%",
					position: "absolute",
				}}
			>
				{t("Your camera fills this frame underneath")}
			</span>
			{[...scene.layers]
				.sort((a, b) => a.zIndex - b.zIndex)
				.map((layer) => {
					const display = studioLayerDisplayState(layer);
					const blocked = blockedLayerIds.includes(layer.id);
					const selected = layer.id === selectedLayerId;
					const draggable = !readOnly && scale > 0;
					return (
						<div
							key={layer.id}
							style={{
								alignItems: "center",
								border: blocked
									? "2px solid #f87171"
									: display.failed
										? "2px solid #ef4444"
										: selected
											? "2px solid #60a5fa"
											: "1px dashed rgba(148,163,184,0.55)",
								color: "white",
								display: "flex",
								height: `${(layer.height / FRAME_HEIGHT) * 100}%`,
								justifyContent: "flex-start",
								left: `${(layer.x / FRAME_WIDTH) * 100}%`,
								opacity: display.visible ? 1 : 0.25,
								overflow: "hidden",
								position: "absolute",
								textAlign: "left",
								top: `${(layer.y / FRAME_HEIGHT) * 100}%`,
								width: `${(layer.width / FRAME_WIDTH) * 100}%`,
								zIndex: layer.zIndex,
							}}
						>
							<LayerBody layer={layer} scale={scale} />
							{selected || blocked || display.failed || !display.visible ? (
								<span
									style={{
										background:
											blocked || display.failed ? "#b91c1c" : "#1d4ed8",
										borderRadius: 2,
										fontSize: "2.2cqh",
										left: 0,
										padding: "0 0.4em",
										pointerEvents: "none",
										position: "absolute",
										top: 0,
									}}
								>
									{layer.name}
									{blocked || display.failed
										? ` · ${blocked ? t("Needs fixing") : t("Failed")}`
										: display.visible
											? ""
											: ` · ${t("Hidden")}`}
								</span>
							) : null}
							<button
								aria-label={
									draggable
										? `${t("Move source")} ${layer.name}`
										: `${t("Edit source")} ${layer.name}`
								}
								onClick={() => onSelect(layer.id)}
								onKeyDown={(event) => {
									const step = NUDGE[event.key];
									if (!step || !draggable) return;
									event.preventDefault();
									const distance = event.shiftKey
										? NUDGE_FINE_STEP
										: NUDGE_STEP;
									onSelect(layer.id);
									onMove(
										layer.id,
										layer.x + step[0] * distance,
										layer.y + step[1] * distance,
									);
								}}
								onPointerDown={(event) => {
									if (!draggable || event.button !== 0) return;
									event.currentTarget.setPointerCapture(event.pointerId);
									drag.current = {
										originX: layer.x,
										originY: layer.y,
										pointerId: event.pointerId,
										startX: event.clientX,
										startY: event.clientY,
									};
									onSelect(layer.id);
								}}
								onPointerMove={(event) => {
									const active = drag.current;
									if (!active || active.pointerId !== event.pointerId) return;
									const next = draggedLayerPosition(
										{ x: active.originX, y: active.originY },
										{ x: active.startX, y: active.startY },
										{ x: event.clientX, y: event.clientY },
										scale,
									);
									onMove(layer.id, next.x, next.y);
								}}
								onPointerUp={(event) => {
									if (drag.current?.pointerId === event.pointerId)
										drag.current = null;
									event.currentTarget.releasePointerCapture(event.pointerId);
								}}
								style={{
									background: "transparent",
									border: 0,
									cursor: draggable ? "move" : "pointer",
									inset: 0,
									padding: 0,
									position: "absolute",
									touchAction: "none",
								}}
								type="button"
							/>
						</div>
					);
				})}
			{scene.layers.length === 0 ? (
				<div
					style={{
						alignItems: "center",
						display: "flex",
						inset: 0,
						justifyContent: "center",
						position: "absolute",
					}}
				>
					<Text color="secondary">{t("No sources in this scene yet")}</Text>
				</div>
			) : null}
		</section>
	);
}
