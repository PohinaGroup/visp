import type { StudioGraph } from "@VISP/api/studio";
import { STUDIO_MEDIA_TYPES } from "@VISP/api/studio-alert";
import {
	type EmptyStudioWarningChoice,
	emptySavedStudioNeedsWarning,
	emptyStudioWarningDecision,
} from "@VISP/api/studio-warning";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Grid } from "@astryxdesign/core/Grid";
import {
	HStack,
	Layout,
	LayoutContent,
	LayoutFooter,
	VStack,
} from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import {
	ArrowDown,
	ArrowUp,
	Bell,
	Copy,
	Eye,
	EyeOff,
	Globe,
	Image,
	LockKeyhole,
	Plus,
	Trash2,
	Type,
	UnlockKeyhole,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n";
import {
	duplicateStudioLayer,
	type LayerRect,
	reorderStudioLayer,
} from "@/lib/studio-editor";
import {
	addStudioLayer,
	addStudioScene,
	addStudioSource,
	deleteStudioLayer,
	deleteStudioScene,
	moveStudioLayer,
	rateLimitRetrySeconds,
	renameStudioScene,
	type StudioLayerType,
	type StudioPreviewPane,
	selectStudioScene,
	studioErrorHint,
	studioLayerDisplayState,
	studioPreviewPanes,
	studioSaveBlockers,
	studioSourceCapacity,
	studioStreamCopy,
	studioStreamStatus,
	updateStudioLayer,
} from "@/lib/studio-model";
import { useTRPC } from "@/utils/trpc";
import { StudioCanvas } from "./studio-canvas";
import styles from "./studio-editor.module.css";
import { StudioInspector } from "./studio-inspector";
import { useStudioDraft } from "./use-studio-draft";
import { WhepPreview } from "./whep-preview";

export function StudioPage() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const studio = useQuery(
		trpc.studio.get.queryOptions(undefined, { refetchInterval: 2_000 }),
	);
	// Camera state drives the same banners as Studio state, so it refreshes on the
	// same cadence — a 2s Studio poll against a never-refetched path list is how
	// "live" went stale while the banner claimed otherwise.
	const paths = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 2_000 }),
	);
	// Only the destination state can confirm viewers are receiving video.
	const direct = useQuery(
		trpc.direct.list.queryOptions(undefined, { refetchInterval: 3_000 }),
	);
	const history = useStudioDraft(studio.data);
	const draft = history.graph;
	const dirty = history.dirty;
	const saving = useRef(false);
	const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
	const [aspectLocked, setAspectLocked] = useState(true);
	const layersToggle = useRef<HTMLButtonElement>(null);
	const inspectorToggle = useRef<HTMLButtonElement>(null);
	const [drawer, setDrawer] = useState<"layers" | "inspector">();
	const closeDrawer = () => {
		(drawer === "layers" ? layersToggle : inspectorToggle).current?.focus();
		setDrawer(undefined);
	};
	const [monitorsOpen, setMonitorsOpen] = useState(false);
	const [selectedSceneId, setSelectedSceneId] = useState<string>();
	const [selectedLayerId, setSelectedLayerId] = useState<string>();
	const [addOpen, setAddOpen] = useState(false);
	const [emptyWarningOpen, setEmptyWarningOpen] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [previewFailed, setPreviewFailed] = useState(false);
	// A dead preview pane is a fact about this browser, never about the broadcast.
	const onProgramPreviewState = useCallback(
		(state: "idle" | "loading" | "playing" | "error") =>
			setPreviewFailed(state === "error"),
		[],
	);
	const [online, setOnline] = useState(
		typeof navigator === "undefined" || navigator.onLine,
	);

	useEffect(() => {
		setSelectedSceneId((id) =>
			draft?.scenes.some((scene) => scene.id === id)
				? id
				: (draft?.activeSceneId ?? draft?.scenes[0]?.id),
		);
	}, [draft]);
	useEffect(() => {
		const update = () => setOnline(navigator.onLine);
		window.addEventListener("online", update);
		window.addEventListener("offline", update);
		return () => {
			window.removeEventListener("online", update);
			window.removeEventListener("offline", update);
		};
	}, []);
	const blocker = useBlocker({
		enableBeforeUnload: dirty,
		shouldBlockFn: () => dirty,
		withResolver: true,
	});

	const failed = (error: unknown, fallback: string) =>
		toast.error(
			t(studioErrorHint(error instanceof Error ? error.message : fallback)),
		);

	const save = useMutation(trpc.studio.save.mutationOptions());
	const saveFailed = (error: unknown) => {
		const seconds = rateLimitRetrySeconds(error);
		if (seconds !== null) {
			toast.error(
				t(
					"Changes weren't saved. Try again in {seconds} seconds. Your edits are still here.",
				).replace("{seconds}", String(seconds)),
			);
			return;
		}
		if (
			error instanceof Error &&
			error.message === "Studio changed elsewhere"
		) {
			toast.error(
				t(
					"Another tab saved this Studio. Reload to see it — your edits are still here.",
				),
			);
			return;
		}
		if (
			error instanceof Error &&
			error.message === "Studio save already in progress"
		) {
			toast.error(t("A save is already running. Your edits are still here."));
			return;
		}
		failed(error, "Save failed");
	};
	/**
	 * The single save path. Refuses to start a second save while one is running,
	 * keeps the draft on failure, and keeps newer local edits on success.
	 */
	const saveDraft = async () => {
		if (
			!history.current.current.graph ||
			saving.current ||
			!online ||
			studio.isError ||
			history.current.current.gesture ||
			studioSaveBlockers(history.current.current.graph).length
		)
			return false;
		const { graph, seq, version } = history.current.current;
		saving.current = true;
		try {
			const saved = await save.mutateAsync({
				graph,
				expectedVersion: version,
			});
			const superseded = history.current.current.seq !== seq;
			history.saved(saved, seq, (version ?? 0) + 1);
			await queryClient.invalidateQueries({
				queryKey: trpc.studio.get.queryKey(),
			});
			toast.success(
				superseded
					? t("Studio saved. Your newer edits are still unsaved.")
					: t("Studio saved — the compositor picks it up within a second"),
			);
			return !superseded;
		} catch (error) {
			saveFailed(error);
			return false;
		} finally {
			saving.current = false;
		}
	};
	const setMode = useMutation(
		trpc.studio.mode.set.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.studio.get.queryKey(),
				});
				toast.success(t("Production mode updated"));
			},
			onError: (error) => failed(error, "Production mode change failed"),
		}),
	);
	const setEmptyWarning = useMutation(
		trpc.studio.emptyWarning.mutationOptions({
			onSuccess: async () =>
				queryClient.invalidateQueries({ queryKey: trpc.studio.get.queryKey() }),
			onError: (error) => failed(error, "Setting could not be saved"),
		}),
	);
	const upload = useMutation(trpc.studio.assetUploadUrl.mutationOptions());
	const finalizeUpload = useMutation(
		trpc.studio.assetFinalize.mutationOptions(),
	);

	const selectedScene = draft?.scenes.find(({ id }) => id === selectedSceneId);
	const selectedLayer = selectedScene?.layers.find(
		({ id }) => id === selectedLayerId,
	);
	// A stale path is one VISP has not heard from in a minute — it is not proof
	// of a live camera, so it must not count as one.
	const livePath = paths.data?.find(
		({ publishing, stale }) => publishing && !stale,
	);
	const live = Boolean(livePath);
	const savedActiveSceneId = studio.data?.graph.activeSceneId ?? null;
	const passthrough = studio.data?.settings.passthrough ?? false;
	const outputs = [
		...(direct.data?.destinations ?? []),
		...(direct.data?.customOutputs ?? []),
	];
	const statusKnown =
		!studio.isError &&
		!paths.isError &&
		!direct.isError &&
		studio.data !== undefined &&
		paths.data !== undefined &&
		direct.data !== undefined;
	const stream = studioStreamStatus({
		statusKnown,
		mode: studio.data?.settings.mode ?? "obs",
		cameraLive: live,
		cameraLiveSince: livePath?.publishLastConnectedAt,
		compositorHealthy: studio.data?.settings.compositorHealthy ?? false,
		outputsLive: outputs.filter(({ state }) => state === "live").length,
		previewFailed,
	});
	const streamCopy = studioStreamCopy(stream.status);
	const preview = studioPreviewPanes(
		studio.data?.preview,
		live,
		passthrough,
		online,
	);
	const blockers = draft ? studioSaveBlockers(draft) : [];
	const capacity = draft
		? studioSourceCapacity(draft, selectedSceneId)
		: undefined;
	const readOnly = !online || studio.isError;
	const saveBlockedReason = readOnly
		? t("Editing is paused until VISP is reachable again.")
		: blockers.length
			? t("Fix the highlighted sources before saving.")
			: !dirty
				? t("Nothing to save — every change is already applied.")
				: undefined;

	const previewCopy = (
		pane: StudioPreviewPane,
		kind: "camera" | "program",
	): { title: string; hint: string } => {
		switch (pane.reason) {
			case "offline":
				return {
					title: t("You are offline"),
					hint: t(
						"Previews need a connection. Anything already saved keeps streaming.",
					),
				};
			case "idle":
				return {
					title: t("Nothing is streaming right now"),
					hint: t(
						"Start publishing from the VISP app or OBS. This preview appears within a few seconds.",
					),
				};
			case "passthrough":
				return {
					title: t("Cloud Studio is temporarily unavailable"),
					hint: t(
						"Overlays aren't being applied. VISP will retry automatically.",
					),
				};
			default:
				return {
					title: t("No stream path yet"),
					hint:
						kind === "camera"
							? t("Finish setup on the dashboard to get a publish target.")
							: t("The program feed appears once Cloud Studio has a path."),
				};
		}
	};

	const mutateDraft = (updater: (graph: StudioGraph) => StudioGraph) => {
		if (readOnly) return;
		try {
			history.edit(updater);
		} catch (error) {
			failed(error, "Update failed");
		}
	};
	const changeLayer = (
		layerId: string,
		over: Parameters<typeof updateStudioLayer>[2],
	) => {
		if (lockedIds.has(layerId)) return;
		mutateDraft((graph) => updateStudioLayer(graph, layerId, over));
	};
	const duplicateLayer = () => {
		if (!selectedLayer || lockedIds.has(selectedLayer.id)) return;
		mutateDraft((graph) => duplicateStudioLayer(graph, selectedLayer.id));
	};
	const removeLayer = () => {
		if (!selectedLayer || lockedIds.has(selectedLayer.id)) return;
		mutateDraft((graph) => deleteStudioLayer(graph, selectedLayer.id));
		setSelectedLayerId(undefined);
	};
	const layerReadOnly =
		readOnly || Boolean(selectedLayerId && lockedIds.has(selectedLayerId));
	const duplicateBlocked =
		!selectedLayer ||
		layerReadOnly ||
		!capacity ||
		capacity.layers.used >= capacity.layers.max ||
		(selectedLayer.type === "browser" &&
			capacity.browser.used >= capacity.browser.max) ||
		(selectedLayer.type === "alert" &&
			capacity.alert.used >= capacity.alert.max);

	const addSource = (type: StudioLayerType, assetId?: string) => {
		const draft = history.current.current.graph;
		if (!draft || readOnly) return;
		try {
			// Sources land in the scene being edited. Which scene is on air is a
			// separate decision the user makes explicitly.
			const target =
				selectedSceneId && draft.scenes.some(({ id }) => id === selectedSceneId)
					? selectedSceneId
					: undefined;
			const next = target
				? {
						...draft,
						scenes: addStudioLayer(draft.scenes, target, type, assetId),
					}
				: addStudioSource(draft, type, assetId);
			const editedSceneId = target ?? next.activeSceneId ?? undefined;
			history.edit(() => next);
			setSelectedSceneId(editedSceneId);
			setSelectedLayerId(
				next.scenes.find(({ id }) => id === editedSceneId)?.layers.at(-1)?.id,
			);
			setAddOpen(false);
		} catch (error) {
			failed(error, "Source could not be added");
		}
	};
	const uploadImageAsset = async (value: File | File[] | null) => {
		const png = value instanceof File ? value : null;
		setFile(png);
		if (!png) return null;
		try {
			if (!(STUDIO_MEDIA_TYPES as readonly string[]).includes(png.type))
				throw new Error("Choose a PNG, JPEG, WebP or GIF image");
			const assetId = crypto.randomUUID();
			const { uploadUrl } = await upload.mutateAsync({
				assetId,
				contentType: png.type as (typeof STUDIO_MEDIA_TYPES)[number],
			});
			const response = await fetch(uploadUrl, {
				method: "PUT",
				headers: { "Content-Type": png.type },
				body: png,
			});
			if (!response.ok) throw new Error("Upload failed, try again");
			await finalizeUpload.mutateAsync({ assetId });
			return assetId;
		} catch (error) {
			failed(error, "Upload failed, try again");
			return null;
		}
	};
	const uploadPng = async (value: File | File[] | null) => {
		const assetId = await uploadImageAsset(value);
		if (assetId) addSource("png", assetId);
	};
	const goLive = () => {
		if (
			emptySavedStudioNeedsWarning(
				studio.data?.settings.mode ?? "obs",
				studio.data?.graph ?? { scenes: [] },
				studio.data?.settings.emptyWarningDismissed ?? false,
			)
		) {
			setEmptyWarningOpen(true);
			return;
		}
		window.location.assign("https://stream.visp-stream.com");
	};
	const chooseEmptyWarning = async (choice: EmptyStudioWarningChoice) => {
		const decision = emptyStudioWarningDecision(choice);
		setEmptyWarningOpen(false);
		if (!decision.continue) return;
		if (decision.dismiss)
			await setEmptyWarning.mutateAsync({ dismissed: true });
		window.location.assign("https://stream.visp-stream.com");
	};

	// A first load that fails must not sit on "Loading Studio…" forever.
	if (!draft || !studio.data)
		return (
			<LayoutContent padding={6}>
				{studio.isError ? (
					<Banner
						container="section"
						status="error"
						title={t("Studio could not be loaded")}
						description={t(
							"VISP could not read your Studio. Anything already saved keeps streaming.",
						)}
						endContent={
							<Button
								isDisabled={studio.isFetching}
								label={t("Retry now")}
								variant="secondary"
								onClick={() => studio.refetch()}
							/>
						}
					/>
				) : (
					<Text>{t("Loading Studio…")}</Text>
				)}
			</LayoutContent>
		);
	if (!studio.data.settings.available)
		return (
			<LayoutContent padding={6}>
				<Banner
					container="section"
					status="info"
					title={t("Cloud Studio is not available yet")}
					description={t(
						"Your account is streaming through Direct as usual. We will enable Cloud Studio here when it reaches your plan.",
					)}
				/>
			</LayoutContent>
		);

	const cloudMode = studio.data.settings.mode === "cloud_studio";

	return (
		<section
			aria-label={t("Cloud Studio editor")}
			className={styles.editor}
			onKeyDown={(event) => {
				if (
					(event.target as HTMLElement).closest(
						'input, textarea, select, [contenteditable="true"], [role="dialog"]',
					) ||
					addOpen ||
					emptyWarningOpen ||
					blocker.status === "blocked"
				)
					return;
				if (event.key === "Escape") {
					setSelectedLayerId(undefined);
					if (drawer) closeDrawer();
					return;
				}
				if (readOnly || history.gesture || event.defaultPrevented) return;
				const nudge = {
					ArrowLeft: [-1, 0],
					ArrowRight: [1, 0],
					ArrowUp: [0, -1],
					ArrowDown: [0, 1],
				}[event.key];
				if (
					nudge &&
					selectedLayer &&
					!layerReadOnly &&
					!event.ctrlKey &&
					!event.metaKey &&
					!event.altKey
				) {
					event.preventDefault();
					const step = event.shiftKey ? 10 : 1;
					changeLayer(selectedLayer.id, {
						x: selectedLayer.x + (nudge[0] ?? 0) * step,
						y: selectedLayer.y + (nudge[1] ?? 0) * step,
					});
					return;
				}
				const command = event.ctrlKey || event.metaKey;
				if (command && event.key.toLowerCase() === "z") {
					event.preventDefault();
					event.shiftKey ? history.redo() : history.undo();
				} else if (command && event.key.toLowerCase() === "y") {
					event.preventDefault();
					history.redo();
				} else if (event.shiftKey && event.key.toLowerCase() === "d") {
					event.preventDefault();
					if (!duplicateBlocked) duplicateLayer();
				} else if (event.key === "Delete") {
					event.preventDefault();
					removeLayer();
				}
			}}
		>
			<header className={styles.header}>
				<div className={styles.toolbar}>
					<Heading level={1}>{t("Cloud Studio")}</Heading>
					<span className={styles.sceneTitle}>
						{selectedScene?.name ?? t("New scene")}
					</span>
					<Badge
						label={
							save.isPending
								? t("Saving…")
								: dirty
									? t("Unsaved changes")
									: t("Saved")
						}
						variant={dirty ? "warning" : "neutral"}
					/>
					<div className={styles.toolbarActions}>
						<Button
							size="sm"
							label={t("Undo")}
							isDisabled={
								readOnly || !history.past.length || Boolean(history.gesture)
							}
							variant="ghost"
							onClick={history.undo}
						/>
						<Button
							size="sm"
							label={t("Redo")}
							isDisabled={
								readOnly || !history.future.length || Boolean(history.gesture)
							}
							variant="ghost"
							onClick={history.redo}
						/>
						<Button
							size="sm"
							label={t("Save and apply")}
							tooltip={
								saveBlockedReason ??
								t("Updates the broadcast when Cloud Studio mode is active.")
							}
							isDisabled={
								readOnly ||
								save.isPending ||
								!dirty ||
								blockers.length > 0 ||
								Boolean(history.gesture)
							}
							variant="primary"
							onClick={() => void saveDraft()}
						/>
						<Button
							size="sm"
							label={t("Go Live")}
							variant="secondary"
							onClick={goLive}
						/>
						<Button
							size="sm"
							label={t("Dashboard")}
							variant="ghost"
							href={`/dashboard${locale === "fi" ? "?lang=fi" : ""}`}
						/>
					</div>
				</div>
				<div className={styles.statusbar}>
					<span>{t(streamCopy.title)}</span>
					<span>
						{cloudMode
							? t("Saved overlays apply to your broadcast")
							: t("OBS mode: overlays are not applied")}
					</span>
					<Button
						size="sm"
						label={t("Monitors and production")}
						aria-expanded={monitorsOpen}
						variant="ghost"
						onClick={() => setMonitorsOpen(!monitorsOpen)}
					/>
				</div>
			</header>
			<div className={styles.notices}>
				{studio.isError ? (
					<Banner
						container="section"
						status="error"
						title={t("Can't reach VISP — editing is paused")}
						description={t(
							"Your saved program keeps streaming. This page retries on its own; nothing you already saved is lost.",
						)}
						endContent={
							<Button
								label={t("Retry now")}
								variant="secondary"
								onClick={() => studio.refetch()}
							/>
						}
					/>
				) : null}
				{!online ? (
					<Banner
						container="section"
						status="warning"
						title={t("You are offline — saved program stays live")}
						description={t(
							"Reconnect to keep editing. Changes made offline are not saved.",
						)}
					/>
				) : null}
				{(streamCopy.tone === "warning" || streamCopy.tone === "error") && (
					<Banner
						container="section"
						status={streamCopy.tone}
						title={t(streamCopy.title)}
						description={
							stream.broadcastConfirmed && stream.status === "camera-only"
								? `${t(streamCopy.description)} ${t("Your camera is still going out to your platforms.")}`
								: t(streamCopy.description)
						}
					/>
				)}
				{!cloudMode ? (
					<Banner
						container="section"
						status="info"
						title={t("You are in OBS mode — these scenes are not on air")}
						description={t(
							"Switch the mode above to Cloud Studio to put this composition on air.",
						)}
					/>
				) : null}
				{blockers.length ? (
					<Banner
						container="section"
						status="error"
						title={t("Fix these sources before saving")}
						description={blockers
							.map(
								({ sceneName, layerName, message }) =>
									`${sceneName} · ${layerName}: ${t(studioErrorHint(message))}`,
							)
							.join("\n")}
					/>
				) : null}
			</div>
			<div className={styles.mobileToolbar}>
				<Button
					label={t("Layers")}
					ref={layersToggle}
					aria-expanded={drawer === "layers"}
					variant="secondary"
					onClick={() => setDrawer(drawer === "layers" ? undefined : "layers")}
				/>
				<Button
					label={t("Inspector")}
					ref={inspectorToggle}
					aria-expanded={drawer === "inspector"}
					variant="secondary"
					onClick={() =>
						setDrawer(drawer === "inspector" ? undefined : "inspector")
					}
				/>
			</div>
			<div className={styles.workspace}>
				<aside
					aria-label={t("Scenes and layers")}
					className={styles.sidebar}
					data-open={drawer === "layers"}
				>
					<div className={styles.drawerClose}>
						<Button
							label={t("Close layers")}
							variant="ghost"
							onClick={closeDrawer}
						/>
					</div>
					<label className={styles.sceneSelector}>
						{t("Scene")}
						<select
							aria-label={t("Scene")}
							value={selectedScene?.id ?? ""}
							onChange={(event) => {
								setSelectedSceneId(event.target.value);
								setSelectedLayerId(undefined);
							}}
						>
							{!draft.scenes.length && (
								<option value="">{t("New scene")}</option>
							)}
							{draft.scenes.map((scene) => (
								<option key={scene.id} value={scene.id}>
									{scene.name}
								</option>
							))}
						</select>
					</label>
					{selectedScene && (
						<>
							<Badge
								label={
									selectedScene.id === savedActiveSceneId
										? t("Saved program scene")
										: selectedScene.id === draft.activeSceneId
											? t("Goes on air when you save")
											: t("Editing only")
								}
								variant={
									selectedScene.id === draft.activeSceneId
										? "success"
										: "neutral"
								}
							/>
							<Button
								size="sm"
								label={t("Use in program")}
								isDisabled={
									readOnly || selectedScene.id === draft.activeSceneId
								}
								tooltip={t("Applies on your next save.")}
								variant="secondary"
								onClick={() =>
									mutateDraft((graph) =>
										selectStudioScene(graph, selectedScene.id),
									)
								}
							/>
						</>
					)}
					<details className={styles.sceneSettings}>
						<summary>
							{t("Scene settings")} · {draft.scenes.length}/3
						</summary>
						{selectedScene && (
							<TextInput
								label={t("Scene name")}
								isDisabled={readOnly}
								value={selectedScene.name}
								onChange={(name) => {
									if (name.trim())
										mutateDraft((graph) =>
											renameStudioScene(graph, selectedScene.id, name),
										);
								}}
							/>
						)}
						<Button
							size="sm"
							label={t("Add scene")}
							isDisabled={readOnly || draft.scenes.length >= 3}
							variant="ghost"
							onClick={() => {
								const id = crypto.randomUUID();
								mutateDraft((graph) => addStudioScene(graph, id));
								setSelectedSceneId(id);
								setSelectedLayerId(undefined);
							}}
						/>
						<Button
							size="sm"
							label={t("Delete scene")}
							isDisabled={
								readOnly || !selectedScene || draft.scenes.length <= 1
							}
							variant="ghost"
							onClick={() => {
								if (selectedScene)
									mutateDraft((graph) =>
										deleteStudioScene(graph, selectedScene.id),
									);
								setSelectedLayerId(undefined);
							}}
						/>
					</details>
					<div className={styles.layerHeading}>
						<Heading level={2}>{t("Layers")}</Heading>
						<span>{selectedScene?.layers.length ?? 0}/8</span>
					</div>
					<Button
						label={t("Add layer")}
						icon={<Plus />}
						isDisabled={readOnly || (capacity?.layers.used ?? 0) >= 8}
						variant="primary"
						onClick={() => setAddOpen(true)}
					/>
					<p className={styles.hint}>{t("Front to back. Drag to reorder.")}</p>
					<ul className={styles.layerList}>
						{[...(selectedScene?.layers ?? [])]
							.sort((a, b) => b.zIndex - a.zIndex)
							.map((layer) => {
								const Icon = {
									text: Type,
									png: Image,
									browser: Globe,
									alert: Bell,
								}[layer.type];
								const locked = lockedIds.has(layer.id);
								const display = studioLayerDisplayState(layer);
								const blocked = blockers.some(
									({ layerId }) => layerId === layer.id,
								);
								return (
									<li
										key={layer.id}
										className={styles.layerRow}
										data-selected={layer.id === selectedLayerId}
										draggable={!readOnly && !locked}
										onDragStart={(event) => {
											event.dataTransfer.setData(
												"application/x-visp-layer",
												layer.id,
											);
											event.dataTransfer.effectAllowed = "move";
										}}
										onDragOver={(event) => {
											if (
												!readOnly &&
												event.dataTransfer.types.includes(
													"application/x-visp-layer",
												)
											)
												event.preventDefault();
										}}
										onDrop={(event) => {
											event.preventDefault();
											const id = event.dataTransfer.getData(
												"application/x-visp-layer",
											);
											if (!lockedIds.has(id))
												mutateDraft((graph) =>
													reorderStudioLayer(graph, id, layer.id),
												);
										}}
									>
										<Button
											size="sm"
											className={styles.layerSelect}
											label={layer.name}
											icon={<Icon />}
											variant="ghost"
											aria-pressed={layer.id === selectedLayerId}
											onClick={() => setSelectedLayerId(layer.id)}
										/>
										<Button
											size="sm"
											isIconOnly
											label={`${display.visible ? t("Hide") : t("Show")} ${layer.name}`}
											icon={display.visible ? <Eye /> : <EyeOff />}
											isDisabled={readOnly || locked}
											variant="ghost"
											onClick={() =>
												changeLayer(layer.id, {
													visible: !display.visible,
													runtimeDisabled: false,
												})
											}
										/>
										<Button
											size="sm"
											isIconOnly
											label={`${locked ? t("Unlock") : t("Lock")} ${layer.name}`}
											tooltip={t("Locks this layer for this editing session.")}
											icon={locked ? <LockKeyhole /> : <UnlockKeyhole />}
											aria-pressed={locked}
											variant="ghost"
											onClick={() =>
												setLockedIds((ids) => {
													const next = new Set(ids);
													if (locked) next.delete(layer.id);
													else next.add(layer.id);
													return next;
												})
											}
										/>
										{layer.id === selectedLayerId && (
											<input
												className={styles.layerRename}
												aria-label={t("Rename layer")}
												value={layer.name}
												maxLength={64}
												disabled={readOnly || locked}
												onChange={(event) =>
													changeLayer(layer.id, { name: event.target.value })
												}
											/>
										)}
										{(blocked || display.failed) && (
											<span className={styles.layerError}>
												{blocked ? t("Needs fixing") : t("Failed")}
											</span>
										)}
									</li>
								);
							})}
					</ul>
					<div className={styles.layerActions}>
						<Button
							size="sm"
							isIconOnly
							label={t("Duplicate layer")}
							icon={<Copy />}
							isDisabled={duplicateBlocked}
							tooltip={
								duplicateBlocked
									? t(
											"Unlock the layer and check source limits before duplicating.",
										)
									: t("Duplicate layer")
							}
							variant="ghost"
							onClick={duplicateLayer}
						/>
						<Button
							size="sm"
							isIconOnly
							label={t("Delete source")}
							icon={<Trash2 />}
							isDisabled={!selectedLayer || layerReadOnly}
							variant="ghost"
							onClick={removeLayer}
						/>
						<Button
							size="sm"
							isIconOnly
							label={t("Move forward")}
							icon={<ArrowUp />}
							isDisabled={!selectedLayer || layerReadOnly}
							variant="ghost"
							onClick={() => {
								if (selectedLayer)
									mutateDraft((graph) =>
										moveStudioLayer(graph, selectedLayer.id, "up"),
									);
							}}
						/>
						<Button
							size="sm"
							isIconOnly
							label={t("Move backward")}
							icon={<ArrowDown />}
							isDisabled={!selectedLayer || layerReadOnly}
							variant="ghost"
							onClick={() => {
								if (selectedLayer)
									mutateDraft((graph) =>
										moveStudioLayer(graph, selectedLayer.id, "down"),
									);
							}}
						/>
					</div>
				</aside>
				<main className={styles.stage}>
					<StudioCanvas
						key={selectedScene?.id ?? "empty"}
						scene={
							selectedScene ?? {
								id: "empty",
								name: "",
								order: 0,
								transition: "cut",
								layers: [],
							}
						}
						selectedLayerId={selectedLayerId}
						blockedLayerIds={blockers.map(({ layerId }) => layerId)}
						lockedIds={lockedIds}
						aspectLocked={aspectLocked}
						readOnly={readOnly}
						onSelect={setSelectedLayerId}
						onChange={(id: string, rect: Partial<LayerRect>) =>
							changeLayer(id, rect)
						}
						onGestureStart={history.beginGesture}
						onGestureEnd={history.endGesture}
						camera={
							<WhepPreview
								url={preview.camera.url}
								label={t("Camera background")}
								emptyTitle={previewCopy(preview.camera, "camera").title}
								emptyHint={previewCopy(preview.camera, "camera").hint}
							/>
						}
					/>
				</main>
				<aside
					aria-label={t("Inspector")}
					className={styles.inspector}
					data-open={drawer === "inspector"}
				>
					<div className={styles.drawerClose}>
						<Button
							label={t("Close inspector")}
							variant="ghost"
							onClick={closeDrawer}
						/>
					</div>
					<StudioInspector
						selectedScene={selectedScene}
						selectedLayer={selectedLayer}
						readOnly={readOnly}
						layerReadOnly={layerReadOnly}
						aspectLocked={aspectLocked}
						setAspectLocked={setAspectLocked}
						mutateDraft={mutateDraft}
						changeLayer={changeLayer}
						uploadImageAsset={uploadImageAsset}
					/>
				</aside>
			</div>
			{monitorsOpen && (
				<section
					className={styles.monitors}
					aria-label={t("Monitors and production")}
				>
					<SegmentedControl
						isDisabled={setMode.isPending || readOnly}
						disabledMessage={
							readOnly
								? t("Editing is paused until VISP is reachable again.")
								: undefined
						}
						label={t("Direct production mode")}
						value={studio.data.settings.mode}
						onChange={(mode) => {
							if (
								!live ||
								window.confirm(
									t(
										"Switching production mode changes what viewers see within seconds. Switch now?",
									),
								)
							)
								setMode.mutate({ mode: mode as "cloud_studio" | "obs" });
						}}
					>
						<SegmentedControlItem
							label={t("Cloud Studio")}
							value="cloud_studio"
						/>
						<SegmentedControlItem label={t("I use OBS")} value="obs" />
					</SegmentedControl>
					<Text color="secondary" type="supporting">
						{cloudMode
							? t(
									"Cloud Studio mode: VISP composes the scenes below onto your camera and sends the result to your platforms.",
								)
							: t(
									"OBS mode: your own software composes the picture. VISP passes your feed through untouched and ignores the scenes below.",
								)}
					</Text>
					<Grid columns={{ minWidth: 280, max: 2, repeat: "fit" }} gap={3}>
						<Card>
							<VStack gap={2}>
								<Text type="label">{t("Camera ingest")}</Text>
								<Text color="secondary" type="supporting">
									{t("What your camera sends into VISP, before overlays.")}
								</Text>
								<WhepPreview
									emptyHint={previewCopy(preview.camera, "camera").hint}
									emptyTitle={previewCopy(preview.camera, "camera").title}
									label={t("Camera ingest")}
									url={preview.camera.url}
								/>
							</VStack>
						</Card>
						<Card>
							<VStack gap={2}>
								<Text type="label">{t("Program")}</Text>
								<Text color="secondary" type="supporting">
									{t("What your viewers see: camera plus your saved sources.")}
								</Text>
								<WhepPreview
									emptyHint={previewCopy(preview.program, "program").hint}
									emptyTitle={previewCopy(preview.program, "program").title}
									label={t("Program")}
									onStateChange={onProgramPreviewState}
									url={preview.program.url}
								/>
							</VStack>
						</Card>
					</Grid>
				</section>
			)}
			<Dialog
				isOpen={addOpen}
				onOpenChange={setAddOpen}
				purpose="form"
				width={480}
			>
				<Layout
					header={
						<DialogHeader title={t("Add source")} onOpenChange={setAddOpen} />
					}
					content={
						<LayoutContent>
							<VStack gap={3}>
								<Text color="secondary" type="supporting">
									{t(
										"Every source is drawn on top of your camera, in the order shown in the scene list.",
									)}
								</Text>
								<Button
									isDisabled={readOnly || (capacity?.layers.used ?? 0) >= 8}
									label={t("Text")}
									tooltip={t(
										"A line of text — show title, topic, or a handle.",
									)}
									variant="secondary"
									onClick={() => addSource("text")}
								/>
								<FileInput
									accept="image/png"
									description={t(
										"PNG, up to 10 MB. Transparency is kept, so logos and frames work.",
									)}
									isDisabled={readOnly || (capacity?.layers.used ?? 0) >= 8}
									label={t("PNG overlay")}
									maxSize={10 * 1024 * 1024}
									mode="dropzone"
									value={file}
									onChange={(value) =>
										setFile(value instanceof File ? value : null)
									}
									changeAction={uploadPng}
								/>
								<Button
									isDisabled={
										readOnly ||
										(capacity?.layers.used ?? 0) >= 8 ||
										(capacity?.browser.used ?? 0) >= 2
									}
									label={`${t("Browser source")} ${capacity?.browser.used ?? 0}/2`}
									tooltip={
										(capacity?.browser.used ?? 0) >= 2
											? t("Browser source limit reached (2)")
											: t(
													"Renders any public https:// page — widgets, timers, chat overlays.",
												)
									}
									variant="secondary"
									onClick={() => addSource("browser")}
								/>
								<Button
									isDisabled={
										readOnly ||
										(capacity?.layers.used ?? 0) >= 8 ||
										(capacity?.alert.used ?? 0) >= 1
									}
									label={`${t("VISP alert")} ${capacity?.alert.used ?? 0}/1`}
									tooltip={
										(capacity?.alert.used ?? 0) >= 1
											? t("Alert layer limit reached (1)")
											: t(
													"Pops up on a follow, sub, or donation. One alert source covers every event.",
												)
									}
									variant="secondary"
									onClick={() => addSource("alert")}
								/>
								<Text color="secondary" type="supporting">
									{t("Sources in this scene")} {capacity?.layers.used ?? 0}/8
								</Text>
							</VStack>
						</LayoutContent>
					}
					footer={
						<LayoutFooter>
							<Button
								label={t("Cancel")}
								variant="ghost"
								onClick={() => setAddOpen(false)}
							/>
						</LayoutFooter>
					}
				/>
			</Dialog>
			<Dialog
				isOpen={emptyWarningOpen}
				onOpenChange={(open) => setEmptyWarningOpen(open)}
				width={480}
			>
				<Layout
					header={<DialogHeader title={t("Empty Cloud Studio")} />}
					content={
						<LayoutContent>
							<Text>
								{t(
									"This studio has no saved sources, so viewers will see your plain camera. Go live anyway?",
								)}
							</Text>
						</LayoutContent>
					}
					footer={
						<LayoutFooter>
							<HStack gap={2}>
								<Button
									label={t("Cancel")}
									variant="ghost"
									onClick={() => chooseEmptyWarning("cancel")}
								/>
								<Button
									label={t("Continue")}
									variant="secondary"
									onClick={() => chooseEmptyWarning("continue")}
								/>
								<Button
									isDisabled={setEmptyWarning.isPending}
									label={t("Don't ask again")}
									variant="primary"
									onClick={() => chooseEmptyWarning("dismiss")}
								/>
							</HStack>
						</LayoutFooter>
					}
				/>
			</Dialog>
			<Dialog
				isOpen={blocker.status === "blocked"}
				onOpenChange={(open) => {
					if (!open && blocker.status === "blocked") blocker.reset();
				}}
				purpose="form"
				width={480}
			>
				<Layout
					header={<DialogHeader title={t("Unsaved Studio changes")} />}
					content={
						<LayoutContent>
							<Text>
								{t("Unsaved changes are not on air. Save them before leaving?")}
							</Text>
						</LayoutContent>
					}
					footer={
						<LayoutFooter>
							<HStack gap={2}>
								<Button
									label={t("Cancel")}
									variant="ghost"
									onClick={() =>
										blocker.status === "blocked" && blocker.reset()
									}
								/>
								<Button
									label={t("Discard")}
									variant="secondary"
									onClick={() => {
										if (blocker.status !== "blocked") return;
										blocker.proceed();
									}}
								/>
								<Button
									label={t("Save and apply")}
									variant="primary"
									isDisabled={readOnly || save.isPending || blockers.length > 0}
									tooltip={
										blockers.length
											? t("Fix the highlighted sources before saving.")
											: undefined
									}
									onClick={async () => {
										if (blocker.status !== "blocked" || !draft) return;
										// Only leave if the save actually landed; a failed save
										// keeps the draft and the dialog.
										if (await saveDraft()) blocker.proceed();
									}}
								/>
							</HStack>
						</LayoutFooter>
					}
				/>
			</Dialog>
		</section>
	);
}
