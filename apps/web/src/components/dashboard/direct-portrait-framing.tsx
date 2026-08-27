import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { useT } from "@/lib/i18n";

export type PortraitCrop = {
	x: number;
	y: number;
	w: number;
	h: number;
	aspect: string;
};

export const DEFAULT_PORTRAIT_CROP: PortraitCrop = {
	x: 0.3418,
	y: 0,
	w: 0.3164,
	h: 1,
	aspect: "9:16",
};

export function DirectPortraitFraming({
	crop,
	isOpen,
	onClose,
	onSave,
	previewUrl,
	saving,
}: {
	crop: PortraitCrop;
	isOpen: boolean;
	onClose: () => void;
	onSave: (crop: PortraitCrop) => Promise<unknown>;
	previewUrl: string | null;
	saving: boolean;
}) {
	const t = useT();
	const [draft, setDraft] = useState(crop);
	const [saveError, setSaveError] = useState<string>();
	const previewRef = useRef<HTMLDivElement>(null);
	const gesture = useRef<
		| {
				crop: PortraitCrop;
				mode: "move" | "resize";
				x: number;
				y: number;
		  }
		| undefined
	>(undefined);
	useEffect(() => {
		setDraft(crop);
		setSaveError(undefined);
	}, [crop]);
	const setHeight = (h: number) => {
		const w = h * (81 / 256);
		setDraft((current) => ({
			...current,
			h,
			w,
			x: Math.min(current.x, 1 - w),
			y: Math.min(current.y, 1 - h),
		}));
	};
	const beginGesture = (
		event: ReactPointerEvent<HTMLElement>,
		mode: "move" | "resize",
	) => {
		event.preventDefault();
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		gesture.current = {
			crop: draft,
			mode,
			x: event.clientX,
			y: event.clientY,
		};
	};
	const moveGesture = (event: ReactPointerEvent<HTMLElement>) => {
		const start = gesture.current;
		const bounds = previewRef.current?.getBoundingClientRect();
		if (!start || !bounds) return;
		const dx = (event.clientX - start.x) / bounds.width;
		const dy = (event.clientY - start.y) / bounds.height;
		if (start.mode === "move") {
			setDraft({
				...start.crop,
				x: Math.max(0, Math.min(1 - start.crop.w, start.crop.x + dx)),
				y: Math.max(0, Math.min(1 - start.crop.h, start.crop.y + dy)),
			});
			return;
		}
		const maxHeight = Math.min(
			1 - start.crop.y,
			(1 - start.crop.x) / (81 / 256),
		);
		setHeight(Math.max(0.25, Math.min(maxHeight, start.crop.h + dy)));
	};
	const valid =
		draft.x >= 0 &&
		draft.y >= 0 &&
		draft.w > 0 &&
		draft.h > 0 &&
		draft.x + draft.w <= 1 &&
		draft.y + draft.h <= 1 &&
		Math.abs(draft.w / draft.h - 81 / 256) <= 0.002;

	return (
		<Dialog
			isOpen={isOpen}
			purpose="form"
			width={640}
			onOpenChange={(open) => !open && onClose()}
		>
			<VStack gap={4} padding={4}>
				<DialogHeader title={t("Frame portrait output")} />
				<HStack gap={4} hAlign="center" wrap="wrap">
					<div
						ref={previewRef}
						aria-label={t("Landscape contribution preview")}
						role="img"
						style={{
							aspectRatio: "16 / 9",
							background: "#111",
							minWidth: 320,
							position: "relative",
							width: "70%",
						}}
					>
						{previewUrl ? (
							<img
								alt=""
								draggable={false}
								src={previewUrl}
								style={{ height: "100%", objectFit: "cover", width: "100%" }}
							/>
						) : (
							<span
								style={{
									color: "white",
									inset: 0,
									position: "absolute",
									display: "grid",
									placeItems: "center",
								}}
							>
								{t("Preview appears while this device is publishing")}
							</span>
						)}
					<div
						aria-label={t("Portrait crop preview")}
						role="group"
						style={{
							border: "2px solid #fff",
							cursor: "move",
							height: `${draft.h * 100}%`,
							left: `${draft.x * 100}%`,
							position: "absolute",
							top: `${draft.y * 100}%`,
							width: `${draft.w * 100}%`,
						}}
						onPointerDown={(event) => beginGesture(event, "move")}
						onPointerMove={moveGesture}
						onPointerUp={() => {
							gesture.current = undefined;
						}}
					>
								border: "2px solid #fff",
								cursor: "move",
								height: `${draft.h * 100}%`,
								left: `${draft.x * 100}%`,
								position: "absolute",
								top: `${draft.y * 100}%`,
								width: `${draft.w * 100}%`,
							}}
							onPointerDown={(event) => beginGesture(event, "move")}
							onPointerMove={moveGesture}
							onPointerUp={() => {
								gesture.current = undefined;
							}}
						>
							<button
								aria-label={t("Resize portrait crop")}
								style={{
									background: "white",
									border: 0,
									bottom: -8,
									cursor: "nwse-resize",
									height: 16,
									position: "absolute",
									right: -8,
									width: 16,
								}}
								type="button"
								onPointerDown={(event) => beginGesture(event, "resize")}
								onPointerMove={moveGesture}
								onPointerUp={() => {
									gesture.current = undefined;
								}}
							/>
						</div>
					</div>
					<div
						aria-label={t("Simulated portrait output")}
						role="img"
						style={{
							aspectRatio: "9 / 16",
							background: "#222",
							overflow: "hidden",
							position: "relative",
							width: 90,
						}}
					>
						{previewUrl ? (
							<img
								alt=""
								draggable={false}
								src={previewUrl}
								style={{
									height: `${100 / draft.h}%`,
									left: `${(-draft.x / draft.w) * 100}%`,
									position: "absolute",
									top: `${(-draft.y / draft.h) * 100}%`,
									width: `${100 / draft.w}%`,
								}}
							/>
						) : null}
					</div>
				</HStack>
				<label>
					<Text type="label">{t("Horizontal crop position")}</Text>
					<input
						aria-label={t("Horizontal crop position")}
						max={1 - draft.w}
						min={0}
						step={0.001}
						type="range"
						value={draft.x}
						onChange={(event) =>
							setDraft({ ...draft, x: Number(event.currentTarget.value) })
						}
					/>
				</label>
				<label>
					<Text type="label">{t("Vertical crop position")}</Text>
					<input
						aria-label={t("Vertical crop position")}
						max={1 - draft.h}
						min={0}
						step={0.001}
						type="range"
						value={draft.y}
						onChange={(event) =>
							setDraft({ ...draft, y: Number(event.currentTarget.value) })
						}
					/>
				</label>
				<label>
					<Text type="label">{t("Crop size")}</Text>
					<input
						aria-label={t("Crop size")}
						max={1}
						min={0.25}
						step={0.001}
						type="range"
						value={draft.h}
						onChange={(event) => setHeight(Number(event.currentTarget.value))}
					/>
				</label>
				<HStack gap={2} hAlign="end">
					{!valid || saveError ? (
						<Text color="secondary" type="supporting">
							{saveError ??
								t(
									"Adjust the crop so it stays within the frame and matches 9:16.",
								)}
						</Text>
					) : null}
					<Button label={t("Cancel")} variant="ghost" onClick={onClose} />
					<Button
						isDisabled={!valid}
						isLoading={saving}
						label={t("Save framing")}
						onClick={() => {
							setSaveError(undefined);
							void onSave(draft).catch(() =>
								setSaveError(
									t("Couldn’t save framing. Check your connection and retry."),
								),
							);
						}}
					/>
				</HStack>
			</VStack>
		</Dialog>
	);
}
