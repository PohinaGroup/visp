import type { StudioGraph } from "@VISP/api/studio";
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
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Grid } from "@astryxdesign/core/Grid";
import {
	HStack,
	Layout,
	LayoutContent,
	LayoutFooter,
	LayoutHeader,
	LayoutPanel,
	VStack,
} from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Selector } from "@astryxdesign/core/Selector";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n";
import {
	addStudioLayer,
	addStudioScene,
	addStudioSource,
	browserSourceUrlError,
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
	const [draft, setDraft] = useState<StudioGraph>();
	const [selectedSceneId, setSelectedSceneId] = useState<string>();
	const [selectedLayerId, setSelectedLayerId] = useState<string>();
	const [addOpen, setAddOpen] = useState(false);
	const [emptyWarningOpen, setEmptyWarningOpen] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [dirty, setDirty] = useState(false);
	// Bumped by every local edit. A save compares it before and after so edits
	// made while the save was in flight are never overwritten by the response.
	const editSeq = useRef(0);
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
		if (studio.data && !dirty) {
			setDraft(studio.data.graph);
			setSelectedSceneId(
				(current) =>
					current ??
					studio.data.graph.activeSceneId ??
					studio.data.graph.scenes[0]?.id,
			);
		}
	}, [dirty, studio.data]);
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
		if (!draft || save.isPending) return false;
		const seq = editSeq.current;
		try {
			const saved = await save.mutateAsync({
				graph: draft,
				expectedVersion: studio.data?.settings.version,
			});
			const superseded = editSeq.current !== seq;
			if (!superseded) {
				setDraft(saved);
				setDirty(false);
			}
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

	const markEdited = () => {
		editSeq.current += 1;
		setDirty(true);
	};
	const mutateDraft = (updater: (graph: StudioGraph) => StudioGraph) => {
		if (!draft || readOnly) return;
		setDraft(updater(draft));
		markEdited();
	};
	const updateLayer = (over: Parameters<typeof updateStudioLayer>[2]) => {
		if (!selectedLayerId) return;
		try {
			mutateDraft((graph) => updateStudioLayer(graph, selectedLayerId, over));
		} catch (error) {
			failed(error, "Update failed");
		}
	};

	const moveLayer = (layerId: string, x: number, y: number) => {
		try {
			mutateDraft((graph) => updateStudioLayer(graph, layerId, { x, y }));
		} catch (error) {
			failed(error, "Update failed");
		}
	};

	const addSource = (type: StudioLayerType, assetId?: string) => {
		if (!draft) return;
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
			setDraft(next);
			setSelectedSceneId(editedSceneId);
			setSelectedLayerId(
				next.scenes.find(({ id }) => id === editedSceneId)?.layers.at(-1)?.id,
			);
			markEdited();
			setAddOpen(false);
		} catch (error) {
			failed(error, "Source could not be added");
		}
	};
	const uploadPngAsset = async (value: File | File[] | null) => {
		const png = value instanceof File ? value : null;
		setFile(png);
		if (!png) return null;
		try {
			const assetId = crypto.randomUUID();
			const { uploadUrl } = await upload.mutateAsync({
				assetId,
				contentType: "image/png",
			});
			const response = await fetch(uploadUrl, {
				method: "PUT",
				headers: { "Content-Type": "image/png" },
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
		const assetId = await uploadPngAsset(value);
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
		<Layout
			height="fill"
			header={
				<LayoutHeader hasDivider>
					<VStack gap={2}>
						<Toolbar
							label={t("Studio actions")}
							startContent={
								<HStack gap={2} vAlign="center">
									<Heading level={1}>{t("Cloud Studio")}</Heading>
									{live ? (
										<>
											<StatusDot
												isPulsing
												label={t("LIVE")}
												variant="success"
											/>
											<Text type="label">{t("LIVE")}</Text>
										</>
									) : (
										<Badge label={t("Offline")} variant="neutral" />
									)}
									{dirty ? (
										<Badge label={t("Unsaved changes")} variant="warning" />
									) : null}
								</HStack>
							}
							endContent={
								<HStack gap={2}>
									<Button
										label={t("Go Live")}
										tooltip={t(
											"Opens the VISP broadcast page. Save first — only the saved composition goes on air.",
										)}
										variant="secondary"
										onClick={goLive}
									/>
									<Button
										isDisabled={
											readOnly ||
											save.isPending ||
											!dirty ||
											blockers.length > 0
										}
										label={t("Save composition")}
										tooltip={
											saveBlockedReason ??
											t("Applies this composition to your saved program.")
										}
										variant="primary"
										onClick={() => void saveDraft()}
									/>
									<Button
										label={t("Dashboard")}
										tooltip={t("Back to paths, platforms, and stream keys.")}
										variant="ghost"
										href={`/dashboard${locale === "fi" ? "?lang=fi" : ""}`}
									/>
								</HStack>
							}
						/>
						<Text color="secondary" type="supporting">
							{t(
								"1. Build a scene below. 2. Save the composition. 3. Go live from the VISP app — the saved program is what viewers see.",
							)}
						</Text>
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
					</VStack>
				</LayoutHeader>
			}
			start={
				<LayoutPanel hasDivider label={t("Scenes")} padding={3} width={240}>
					<VStack gap={2}>
						<Heading level={2}>{t("Scenes")}</Heading>
						<Text color="secondary" type="supporting">
							{t(
								"A scene is one arrangement of sources. Switch between them while live.",
							)}
						</Text>
						{draft.scenes.map((scene) => (
							<VStack gap={1} key={scene.id}>
								<Button
									label={scene.name}
									tooltip={t("Open this scene for editing.")}
									variant={scene.id === selectedSceneId ? "secondary" : "ghost"}
									onClick={() => {
										setSelectedSceneId(scene.id);
										setSelectedLayerId(undefined);
									}}
								/>
								{scene.id === savedActiveSceneId ? (
									<Badge label={t("On air")} variant="success" />
								) : scene.id === draft.activeSceneId ? (
									<Badge
										label={t("Goes on air when you save")}
										variant="warning"
									/>
								) : null}
								{scene.id === selectedSceneId ? (
									<>
										<Button
											isDisabled={readOnly || scene.id === draft.activeSceneId}
											label={t("Put on air")}
											tooltip={
												scene.id === draft.activeSceneId
													? t("This scene is already the one that goes on air.")
													: t(
															"Makes this the scene viewers see, from your next save.",
														)
											}
											variant="secondary"
											onClick={() =>
												mutateDraft((graph) =>
													selectStudioScene(graph, scene.id),
												)
											}
										/>
										<TextInput
											description={t("Only you see scene names.")}
											isDisabled={readOnly}
											label={t("Scene name")}
											value={scene.name}
											onChange={(name) => {
												if (name.trim())
													mutateDraft((graph) =>
														renameStudioScene(graph, scene.id, name),
													);
											}}
										/>
										<Button
											isDisabled={readOnly || draft.scenes.length <= 1}
											label={t("Delete scene")}
											tooltip={
												draft.scenes.length <= 1
													? t("Your program needs at least one scene.")
													: t("Removes this scene and its sources.")
											}
											variant="ghost"
											onClick={() => {
												const next = deleteStudioScene(draft, scene.id);
												setDraft(next);
												setSelectedSceneId(next.scenes[0]?.id ?? undefined);
												setSelectedLayerId(undefined);
												markEdited();
											}}
										/>
									</>
								) : null}
							</VStack>
						))}
						<Button
							isDisabled={readOnly || draft.scenes.length >= 3}
							label={t("Add scene")}
							tooltip={
								draft.scenes.length >= 3
									? t("Scene limit reached (3)")
									: t("Cloud Studio allows up to 3 scenes.")
							}
							variant="secondary"
							onClick={() => {
								const id = crypto.randomUUID();
								try {
									mutateDraft((graph) => addStudioScene(graph, id));
									setSelectedSceneId(id);
									setSelectedLayerId(undefined);
								} catch (error) {
									failed(error, "Scene could not be added");
								}
							}}
						/>
						<Text color="secondary" type="supporting">
							{t("Scenes")} {draft.scenes.length}/3
						</Text>
					</VStack>
				</LayoutPanel>
			}
			end={
				<LayoutPanel hasDivider label={t("Inspector")} padding={3} width={300}>
					<VStack gap={3}>
						<Heading level={2}>{t("Inspector")}</Heading>
						{selectedScene ? (
							<SegmentedControl
								label={t("Transition")}
								isDisabled={readOnly}
								value={selectedScene.transition}
								onChange={(transition) =>
									mutateDraft((graph) => ({
										...graph,
										scenes: graph.scenes.map((scene) =>
											scene.id === selectedSceneId
												? {
														...scene,
														transition: transition as "cut" | "fade",
													}
												: scene,
										),
									}))
								}
							>
								<SegmentedControlItem label={t("Cut")} value="cut" />
								<SegmentedControlItem label={t("Fade")} value="fade" />
							</SegmentedControl>
						) : null}
						{selectedScene ? (
							<Text color="secondary" type="supporting">
								{selectedScene.transition === "cut"
									? t("Cut: instant switch into this scene.")
									: t(
											"Fade: half-second blend. Uses more of the frame budget than Cut.",
										)}
							</Text>
						) : null}
						{selectedLayer ? (
							<>
								<TextInput
									description={t("Only you see source names.")}
									isDisabled={readOnly}
									label={t("Source name")}
									value={selectedLayer.name}
									onChange={(name) => updateLayer({ name })}
								/>
								<Switch
									description={
										studioLayerDisplayState(selectedLayer).failed
											? t(
													"This source failed at runtime. Turning it on retries it.",
												)
											: t(
													"Hidden sources stay in the scene but are not rendered.",
												)
									}
									isDisabled={readOnly}
									label={t("Visible")}
									value={studioLayerDisplayState(selectedLayer).visible}
									onChange={(visible) =>
										updateLayer({ visible, runtimeDisabled: false })
									}
								/>
								{selectedLayer.type === "text" ? (
									<TextInput
										description={t("Shown on screen exactly as typed.")}
										isDisabled={readOnly}
										label={t("Text")}
										status={
											selectedLayer.text.trim()
												? undefined
												: {
														type: "warning",
														message: t("Empty text renders nothing on screen."),
													}
										}
										value={selectedLayer.text}
										onChange={(text) => updateLayer({ text })}
									/>
								) : null}
								{selectedLayer.type === "browser" ? (
									<TextInput
										description={t(
											"Any public https:// page — a widget, a timer, a chat overlay.",
										)}
										isDisabled={readOnly}
										label={t("Browser URL")}
										status={
											browserSourceUrlError(selectedLayer.url)
												? {
														type: "error",
														message: t(
															"Use an https:// address that opens in a normal browser tab, with no username or password in it.",
														),
													}
												: undefined
										}
										value={selectedLayer.url}
										onChange={(url) => updateLayer({ url })}
									/>
								) : null}
								{selectedLayer.type === "browser" ? (
									<Text color="secondary" type="supporting">
										{t(
											"Some sites refuse to be embedded, so this box can look empty here even though the compositor renders it on air.",
										)}
									</Text>
								) : null}
								{selectedLayer.type === "alert" ? (
									<Selector
										description={t(
											"The alert only appears when this event fires on your platform.",
										)}
										label={t("Alert event")}
										options={["follow", "sub", "donation"]}
										value={selectedLayer.event}
										onChange={(event) =>
											updateLayer({
												event: event as "follow" | "sub" | "donation",
											})
										}
									/>
								) : null}
								{selectedLayer.type === "png" ? (
									<FileInput
										accept="image/png"
										description={t("PNG, up to 10 MB.")}
										label={t("Replace PNG")}
										maxSize={10 * 1024 * 1024}
										mode="dropzone"
										value={null}
										onChange={(value) =>
											setFile(value instanceof File ? value : null)
										}
										changeAction={async (value) => {
											const assetId = await uploadPngAsset(value);
											if (assetId) updateLayer({ assetId });
										}}
									/>
								) : null}
								<Text color="secondary" type="supporting">
									{t(
										"Position and size in pixels. The frame is 1920 × 1080. You can also drag the source in the preview.",
									)}
								</Text>
								<Grid
									columns={{ minWidth: 100, max: 2, repeat: "fit" }}
									gap={2}
								>
									<NumberInput
										isDisabled={readOnly}
										label={t("X position")}
										value={selectedLayer.x}
										onChange={(x) => x !== null && updateLayer({ x })}
									/>
									<NumberInput
										isDisabled={readOnly}
										label={t("Y position")}
										value={selectedLayer.y}
										onChange={(y) => y !== null && updateLayer({ y })}
									/>
									<NumberInput
										isDisabled={readOnly}
										label={t("Width")}
										value={selectedLayer.width}
										onChange={(width) =>
											width !== null && updateLayer({ width })
										}
									/>
									<NumberInput
										isDisabled={readOnly}
										label={t("Height")}
										value={selectedLayer.height}
										onChange={(height) =>
											height !== null && updateLayer({ height })
										}
									/>
								</Grid>
								<HStack gap={2}>
									<Button
										isDisabled={readOnly}
										label={t("Move forward")}
										tooltip={t("Draw this source on top of the one above it.")}
										variant="secondary"
										onClick={() =>
											mutateDraft((graph) =>
												moveStudioLayer(graph, selectedLayer.id, "up"),
											)
										}
									/>
									<Button
										isDisabled={readOnly}
										label={t("Move backward")}
										tooltip={t("Draw this source behind the one below it.")}
										variant="secondary"
										onClick={() =>
											mutateDraft((graph) =>
												moveStudioLayer(graph, selectedLayer.id, "down"),
											)
										}
									/>
								</HStack>
								<Button
									isDisabled={readOnly}
									label={t("Delete source")}
									tooltip={t(
										"Removes it from this scene. Saving makes it final.",
									)}
									variant="ghost"
									onClick={() => {
										mutateDraft((graph) =>
											deleteStudioLayer(graph, selectedLayer.id),
										);
										setSelectedLayerId(undefined);
									}}
								/>
							</>
						) : (
							<Text color="secondary">
								{t(
									"Nothing selected. Click a source in the preview or the list to edit it.",
								)}
							</Text>
						)}
					</VStack>
				</LayoutPanel>
			}
		>
			<LayoutContent padding={4}>
				<VStack gap={4}>
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
					<Banner
						container="section"
						status={streamCopy.tone === "success" ? "info" : streamCopy.tone}
						title={t(streamCopy.title)}
						description={
							stream.broadcastConfirmed && stream.status === "camera-only"
								? `${t(streamCopy.description)} ${t("Your camera is still going out to your platforms.")}`
								: t(streamCopy.description)
						}
					/>
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
					<Card>
						{!selectedScene || selectedScene.layers.length === 0 ? (
							<EmptyState
								headingLevel={2}
								title={t("Add a source to build your program")}
								description={t(
									"Sources stack on top of your camera: text, a PNG overlay, any public web page, or a VISP alert. You can arrange them here without being live.",
								)}
								actions={
									<Button
										isDisabled={readOnly}
										label={t("Add source")}
										tooltip={t("Pick what to place on top of your camera.")}
										variant="primary"
										onClick={() => setAddOpen(true)}
									/>
								}
							/>
						) : (
							<VStack gap={3}>
								<HStack hAlign="between" vAlign="center">
									<VStack gap={0}>
										<Heading level={2}>{selectedScene.name}</Heading>
										<Text color="secondary" type="supporting">
											{t(
												"Editing preview — drag a source to move it, or select it and nudge with the arrow keys. Sizes and exact positions are on the right.",
											)}
										</Text>
									</VStack>
									<Button
										isDisabled={readOnly || (capacity?.layers.used ?? 0) >= 8}
										label={t("Add source")}
										tooltip={
											(capacity?.layers.used ?? 0) >= 8
												? t("Layer limit reached (8)")
												: t("Pick what to place on top of your camera.")
										}
										variant="primary"
										onClick={() => setAddOpen(true)}
									/>
								</HStack>
								<StudioCanvas
									blockedLayerIds={blockers.map(({ layerId }) => layerId)}
									readOnly={readOnly}
									scene={selectedScene}
									selectedLayerId={selectedLayerId}
									onMove={moveLayer}
									onSelect={setSelectedLayerId}
								/>
								<VStack gap={1}>
									<Text type="label">{t("Sources, front to back")}</Text>
									{[...selectedScene.layers]
										.sort((a, b) => b.zIndex - a.zIndex)
										.map((layer) => {
											const display = studioLayerDisplayState(layer);
											const blocked = blockers.some(
												({ layerId }) => layerId === layer.id,
											);
											return (
												<HStack gap={2} key={layer.id} vAlign="center">
													<Button
														label={`${layer.name} · ${t(layer.type)}`}
														variant={
															layer.id === selectedLayerId
																? "secondary"
																: "ghost"
														}
														onClick={() => setSelectedLayerId(layer.id)}
													/>
													{blocked ? (
														<Badge label={t("Needs fixing")} variant="error" />
													) : display.failed ? (
														<Badge label={t("Failed")} variant="error" />
													) : display.visible ? null : (
														<Badge label={t("Hidden")} variant="neutral" />
													)}
												</HStack>
											);
										})}
									<Text color="secondary" type="supporting">
										{t("Sources in this scene")} {selectedScene.layers.length}/8
									</Text>
								</VStack>
							</VStack>
						)}
					</Card>
				</VStack>
			</LayoutContent>
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
									isDisabled={(capacity?.layers.used ?? 0) >= 8}
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
									isDisabled={(capacity?.browser.used ?? 0) >= 2}
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
									isDisabled={(capacity?.alert.used ?? 0) >= 1}
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
										setDirty(false);
										blocker.proceed();
									}}
								/>
								<Button
									label={t("Save composition")}
									variant="primary"
									isDisabled={save.isPending || blockers.length > 0}
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
		</Layout>
	);
}
