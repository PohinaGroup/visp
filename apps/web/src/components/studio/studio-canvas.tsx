import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import type { PointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";
import {
	type LayerRect,
	type ResizeHandle,
	resizeStudioLayer,
	snapStudioPosition,
} from "@/lib/studio-editor";
import {
	browserSourceUrlError,
	draggedLayerPosition,
	type StudioLayer,
	type StudioScene,
	studioLayerDisplayState,
} from "@/lib/studio-model";
import { useTRPC } from "@/utils/trpc";
import styles from "./studio-editor.module.css";

const FRAME_WIDTH = 1920;
const NUDGE_STEP = 1;
const NUDGE_FINE_STEP = 10;

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

function LayerBody({
	layer,
	scale,
	sampleAlert,
}: {
	layer: StudioLayer;
	scale: number;
	sampleAlert: boolean;
}) {
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
					{sampleAlert ? t("Sample viewer") : t("VISP alert")} ·{" "}
					{t(layer.event)}
					<br />
					{sampleAlert
						? t("Sample alert, preview only")
						: t("Shows only when the event fires")}
				</span>
			);
	}
}

export function StudioCanvas({
	blockedLayerIds,
	readOnly,
	scene,
	selectedLayerId,
	lockedIds,
	aspectLocked,
	camera,
	onChange,
	onSelect,
	onGestureStart,
	onGestureEnd,
}: {
	blockedLayerIds: string[];
	readOnly: boolean;
	scene: StudioScene;
	selectedLayerId?: string;
	lockedIds: Set<string>;
	aspectLocked: boolean;
	camera?: ReactNode;
	onChange: (layerId: string, rect: Partial<LayerRect>) => void;
	onSelect: (layerId?: string) => void;
	onGestureStart: () => void;
	onGestureEnd: () => void;
}) {
	const t = useT();
	const viewport = useRef<HTMLDivElement>(null);
	const drag = useRef<{
		layerId: string;
		origin: LayerRect;
		startX: number;
		startY: number;
		pointerId: number;
		handle?: ResizeHandle;
		scale: number;
	} | null>(null);
	const [fitWidth, setFitWidth] = useState(0);
	const [zoom, setZoom] = useState(0);
	const [clean, setClean] = useState(false);
	const [showCamera, setShowCamera] = useState(false);
	const [snapping, setSnapping] = useState(true);
	const [sampleAlert, setSampleAlert] = useState(false);
	const [guides, setGuides] = useState<{ guideX?: number; guideY?: number }>(
		{},
	);
	useEffect(() => {
		const node = viewport.current;
		if (!node) return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry)
				setFitWidth(
					Math.max(
						1,
						Math.min(
							entry.contentRect.width - 32,
							((entry.contentRect.height - 32) * 16) / 9,
						),
					),
				);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		if (!sampleAlert) return;
		const timer = setTimeout(() => setSampleAlert(false), 5000);
		return () => clearTimeout(timer);
	}, [sampleAlert]);
	useEffect(
		() => () => {
			if (drag.current) onGestureEnd();
		},
		[onGestureEnd],
	);
	const width = zoom ? FRAME_WIDTH * zoom : fitWidth;
	const scale = width / FRAME_WIDTH;
	const finish = () => {
		if (!drag.current) return;
		drag.current = null;
		setGuides({});
		onGestureEnd();
	};
	const begin = (
		event: PointerEvent<HTMLButtonElement>,
		layer: StudioLayer,
		handle?: ResizeHandle,
	) => {
		if (
			readOnly ||
			clean ||
			lockedIds.has(layer.id) ||
			scale <= 0 ||
			event.button !== 0
		)
			return;
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.focus();
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = {
			layerId: layer.id,
			origin: layer,
			startX: event.clientX,
			startY: event.clientY,
			pointerId: event.pointerId,
			handle,
			scale,
		};
		onSelect(layer.id);
		onGestureStart();
	};
	const move = (event: PointerEvent<HTMLButtonElement>) => {
		const active = drag.current;
		if (!active || event.pointerId !== active.pointerId) return;
		if (readOnly || lockedIds.has(active.layerId)) {
			finish();
			return;
		}
		if (active.handle) {
			onChange(
				active.layerId,
				resizeStudioLayer(
					active.origin,
					active.handle,
					(event.clientX - active.startX) / active.scale,
					(event.clientY - active.startY) / active.scale,
					aspectLocked || event.shiftKey,
				),
			);
		} else {
			const position = draggedLayerPosition(
				active.origin,
				{ x: active.startX, y: active.startY },
				{ x: event.clientX, y: event.clientY },
				active.scale,
			);
			const next =
				snapping && !event.altKey
					? snapStudioPosition(
							{ ...active.origin, ...position },
							6 / active.scale,
						)
					: { ...position, guideX: undefined, guideY: undefined };
			setGuides(next);
			onChange(active.layerId, { x: next.x, y: next.y });
		}
	};
	const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
	return (
		<div className={styles.canvasEditor}>
			<div className={styles.canvasToolbar}>
				<Text type="label">{t("Draft preview")}</Text>
				<label>
					{t("Zoom")}{" "}
					<select
						aria-label={t("Zoom")}
						value={zoom}
						onChange={(event) => setZoom(Number(event.target.value))}
					>
						<option value={0}>{t("Fit to screen")}</option>
						{[0.25, 0.5, 1, 2].map((value) => (
							<option key={value} value={value}>
								{value * 100}%
							</option>
						))}
					</select>
				</label>
				<Button
					size="sm"
					label={t("Snap")}
					aria-pressed={snapping}
					variant={snapping ? "secondary" : "ghost"}
					onClick={() => setSnapping(!snapping)}
				/>
				<Button
					size="sm"
					label={t("Clean preview")}
					aria-pressed={clean}
					variant={clean ? "secondary" : "ghost"}
					onClick={() => setClean(!clean)}
				/>
				<Button
					size="sm"
					label={t("Camera background")}
					aria-pressed={showCamera}
					variant={showCamera ? "secondary" : "ghost"}
					onClick={() => setShowCamera(!showCamera)}
				/>
				{scene.layers.some(({ type }) => type === "alert") && (
					<Button
						size="sm"
						label={t("Test alert")}
						isDisabled={sampleAlert}
						variant="ghost"
						onClick={() => setSampleAlert(true)}
					/>
				)}
			</div>
			<div className={styles.canvasViewport} ref={viewport}>
				<section
					aria-label={t("Composition preview")}
					className={styles.canvasFrame}
					style={{ width, minWidth: width, height: (width * 9) / 16 }}
				>
					{showCamera && (
						<div className={styles.cameraBackground}>{camera}</div>
					)}
					<button
						type="button"
						className={styles.canvasDeselect}
						aria-label={t("Deselect layers")}
						onClick={() => onSelect(undefined)}
					/>
					{[...scene.layers]
						.sort((a, b) => a.zIndex - b.zIndex)
						.map((layer) => {
							const display = studioLayerDisplayState(layer);
							const blocked = blockedLayerIds.includes(layer.id);
							const selected = layer.id === selectedLayerId && !clean;
							const locked = lockedIds.has(layer.id);
							if (
								clean &&
								(!display.visible || (layer.type === "alert" && !sampleAlert))
							)
								return null;
							return (
								<div
									key={layer.id}
									data-layer-id={layer.id}
									className={styles.canvasLayer}
									style={{
										left: layer.x * scale,
										top: layer.y * scale,
										width: layer.width * scale,
										height: layer.height * scale,
										zIndex: layer.zIndex + 1,
										opacity: display.visible ? 1 : 0.25,
										outline: clean
											? undefined
											: blocked || display.failed
												? "2px solid #ef4444"
												: selected
													? "2px solid #60a5fa"
													: undefined,
									}}
								>
									<div className={styles.layerBody}>
										<LayerBody
											layer={layer}
											scale={scale}
											sampleAlert={sampleAlert}
										/>
									</div>
									{!clean && (
										<button
											type="button"
											className={styles.layerMove}
											aria-label={`${t("Edit source")} ${layer.name}`}
											style={{
												cursor: locked || readOnly ? "pointer" : "move",
											}}
											onClick={() => onSelect(layer.id)}
											onPointerDown={(event) => begin(event, layer)}
											onPointerMove={move}
											onPointerUp={finish}
											onPointerCancel={finish}
											onLostPointerCapture={finish}
											onKeyDown={(event) => {
												const step = NUDGE[event.key];
												if (!step || locked || readOnly) return;
												event.preventDefault();
												const distance = event.shiftKey
													? NUDGE_FINE_STEP
													: NUDGE_STEP;
												onSelect(layer.id);
												onChange(layer.id, {
													x: layer.x + step[0] * distance,
													y: layer.y + step[1] * distance,
												});
											}}
										/>
									)}
									{selected &&
										!locked &&
										!readOnly &&
										handles.map((handle) => (
											<button
												key={handle}
												type="button"
												aria-label={`${t("Resize source")} ${handle}`}
												className={styles.resizeHandle}
												style={{
													left: handle.includes("w")
														? 0
														: handle.includes("e")
															? "100%"
															: "50%",
													top: handle.includes("n")
														? 0
														: handle.includes("s")
															? "100%"
															: "50%",
													cursor: `${handle}-resize`,
												}}
												onPointerDown={(event) => begin(event, layer, handle)}
												onPointerMove={move}
												onPointerUp={finish}
												onPointerCancel={finish}
												onLostPointerCapture={finish}
												onKeyDown={(event) => {
													const step = NUDGE[event.key];
													if (!step) return;
													event.preventDefault();
													const distance = event.shiftKey ? 10 : 1;
													onChange(
														layer.id,
														resizeStudioLayer(
															layer,
															handle,
															step[0] * distance,
															step[1] * distance,
															aspectLocked,
														),
													);
												}}
											/>
										))}
								</div>
							);
						})}
					{!clean && guides.guideX !== undefined && (
						<div
							className={styles.guide}
							style={{
								left: Math.min(width - 1, guides.guideX * scale),
								top: 0,
								bottom: 0,
								borderLeft: "1px solid #f472b6",
							}}
						/>
					)}
					{!clean && guides.guideY !== undefined && (
						<div
							className={styles.guide}
							style={{
								top: Math.min((width * 9) / 16 - 1, guides.guideY * scale),
								left: 0,
								right: 0,
								borderTop: "1px solid #f472b6",
							}}
						/>
					)}
					{!scene.layers.length && !clean && (
						<span className={styles.canvasEmpty}>
							{t("Add a layer to start building your overlay")}
						</span>
					)}
				</section>
			</div>
			<div className={styles.canvasFooter}>
				<span>1920 × 1080 · {Math.round(scale * 100)}%</span>
				<span>{t("Draft only. Save and apply to update the program.")}</span>
			</div>
		</div>
	);
}
