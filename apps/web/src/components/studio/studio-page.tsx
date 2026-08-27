import type { StudioGraph } from "@VISP/api/studio";
import {
	type EmptyStudioWarningChoice,
	emptySavedStudioNeedsWarning,
	emptyStudioWarningDecision,
} from "@VISP/api/studio-warning";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocale, useT } from "@/lib/i18n";
import {
	addStudioScene,
	addStudioSource,
	deleteStudioLayer,
	deleteStudioScene,
	moveStudioLayer,
	renameStudioScene,
	type StudioLayerType,
	selectStudioScene,
	studioLayerDisplayState,
	updateStudioLayer,
} from "@/lib/studio-model";
import { useTRPC } from "@/utils/trpc";
import { WhepPreview } from "./whep-preview";

export function StudioPage() {
	const t = useT();
	const locale = useLocale();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const studio = useQuery(
		trpc.studio.get.queryOptions(undefined, { refetchInterval: 2_000 }),
	);
	const paths = useQuery(trpc.paths.list.queryOptions());
	const [draft, setDraft] = useState<StudioGraph>();
	const [selectedSceneId, setSelectedSceneId] = useState<string>();
	const [selectedLayerId, setSelectedLayerId] = useState<string>();
	const [addOpen, setAddOpen] = useState(false);
	const [emptyWarningOpen, setEmptyWarningOpen] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [dirty, setDirty] = useState(false);
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

	const save = useMutation(
		trpc.studio.save.mutationOptions({
			onSuccess: async (graph) => {
				setDraft(graph);
				setDirty(false);
				await queryClient.invalidateQueries({
					queryKey: trpc.studio.get.queryKey(),
				});
				toast.success(t("Studio saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const setMode = useMutation(
		trpc.studio.mode.set.mutationOptions({
			onSuccess: async () =>
				queryClient.invalidateQueries({ queryKey: trpc.studio.get.queryKey() }),
			onError: (error) => toast.error(error.message),
		}),
	);
	const setEmptyWarning = useMutation(
		trpc.studio.emptyWarning.mutationOptions({
			onSuccess: async () =>
				queryClient.invalidateQueries({ queryKey: trpc.studio.get.queryKey() }),
			onError: (error) => toast.error(error.message),
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
	const live = paths.data?.some(({ publishing }) => publishing) ?? false;
	const readOnly = !online || studio.isError;
	const mutateDraft = (updater: (graph: StudioGraph) => StudioGraph) => {
		if (!draft || readOnly) return;
		setDraft(updater(draft));
		setDirty(true);
	};
	const updateLayer = (over: Parameters<typeof updateStudioLayer>[2]) => {
		if (!selectedLayerId) return;
		try {
			mutateDraft((graph) => updateStudioLayer(graph, selectedLayerId, over));
		} catch (error) {
			toast.error(
				error instanceof Error ? t(error.message) : t("Update failed"),
			);
		}
	};

	const addSource = (type: StudioLayerType, assetId?: string) => {
		if (!draft) return;
		try {
			const next = addStudioSource(
				selectedSceneId ? { ...draft, activeSceneId: selectedSceneId } : draft,
				type,
				assetId,
			);
			setDraft(next);
			setSelectedSceneId(next.activeSceneId ?? undefined);
			setDirty(true);
			setAddOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? t(error.message)
					: t("Source could not be added"),
			);
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
			if (!response.ok) throw new Error(t("Upload failed, try again"));
			await finalizeUpload.mutateAsync({ assetId });
			return assetId;
		} catch (error) {
			toast.error(
				error instanceof Error
					? t(error.message)
					: t("Upload failed, try again"),
			);
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

	if (!draft || !studio.data)
		return (
			<LayoutContent padding={6}>
				<Text>{t("Loading Studio…")}</Text>
			</LayoutContent>
		);
	if (!studio.data.settings.available)
		return (
			<LayoutContent padding={6}>
				<Banner status="info" title={t("Cloud Studio is not available yet")} />
			</LayoutContent>
		);

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
									) : null}
								</HStack>
							}
							endContent={
								<HStack gap={2}>
									<Button
										label={t("Go Live")}
										variant="secondary"
										onClick={goLive}
									/>
									<Button
										isDisabled={readOnly || save.isPending || !dirty}
										label={t("Save")}
										variant="primary"
										onClick={() => draft && save.mutate(draft)}
									/>
									<Button
										label={t("Dashboard")}
										variant="ghost"
										href={`/dashboard${locale === "fi" ? "?lang=fi" : ""}`}
									/>
								</HStack>
							}
						/>
						<SegmentedControl
							isDisabled={setMode.isPending}
							label={t("Direct production mode")}
							value={studio.data.settings.mode}
							onChange={(mode) => {
								if (
									!live ||
									window.confirm(t("Switch production mode while live?"))
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
					</VStack>
				</LayoutHeader>
			}
			start={
				<LayoutPanel hasDivider label={t("Scenes")} padding={3} width={220}>
					<VStack gap={2}>
						<Heading level={2}>{t("Scenes")}</Heading>
						{draft.scenes.map((scene) => (
							<VStack gap={1} key={scene.id}>
								<Button
									label={scene.name}
									variant={scene.id === selectedSceneId ? "secondary" : "ghost"}
									onClick={() => {
										mutateDraft((graph) => selectStudioScene(graph, scene.id));
										setSelectedSceneId(scene.id);
										setSelectedLayerId(undefined);
									}}
								/>
								{scene.id === selectedSceneId ? (
									<>
										<TextInput
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
											isDisabled={readOnly}
											label={t("Delete scene")}
											variant="ghost"
											onClick={() => {
												const next = deleteStudioScene(draft, scene.id);
												setDraft(next);
												setSelectedSceneId(next.activeSceneId ?? undefined);
												setSelectedLayerId(undefined);
												setDirty(true);
											}}
										/>
									</>
								) : null}
							</VStack>
						))}
						<Button
							isDisabled={readOnly || draft.scenes.length >= 3}
							label={
								draft.scenes.length >= 3
									? t("Scene limit reached (3)")
									: t("Add scene")
							}
							variant="secondary"
							onClick={() => {
								const id = crypto.randomUUID();
								mutateDraft((graph) => addStudioScene(graph, id));
								setSelectedSceneId(id);
								setSelectedLayerId(undefined);
							}}
						/>
					</VStack>
				</LayoutPanel>
			}
			end={
				<LayoutPanel hasDivider label={t("Inspector")} padding={3} width={280}>
					<VStack gap={3}>
						<Heading level={2}>{t("Inspector")}</Heading>
						{selectedScene ? (
							<SegmentedControl
								label={t("Transition")}
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
						{selectedLayer ? (
							<>
								<TextInput
									isDisabled={readOnly}
									label={t("Source name")}
									value={selectedLayer.name}
									onChange={(name) => updateLayer({ name })}
								/>
								<Switch
									isDisabled={readOnly}
									label={t("Visible")}
									value={studioLayerDisplayState(selectedLayer).visible}
									onChange={(visible) =>
										updateLayer({ visible, runtimeDisabled: false })
									}
								/>
								{selectedLayer.type === "text" ? (
									<TextInput
										isDisabled={readOnly}
										label={t("Text")}
										value={selectedLayer.text}
										onChange={(text) => updateLayer({ text })}
									/>
								) : null}
								{selectedLayer.type === "browser" ? (
									<TextInput
										isDisabled={readOnly}
										label={t("Browser URL")}
										value={selectedLayer.url}
										onChange={(url) => updateLayer({ url })}
									/>
								) : null}
								{selectedLayer.type === "alert" ? (
									<Selector
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
								<Grid
									columns={{ minWidth: 100, max: 2, repeat: "fit" }}
									gap={2}
								>
									<NumberInput
										label={t("X position")}
										value={selectedLayer.x}
										onChange={(x) => x !== null && updateLayer({ x })}
									/>
									<NumberInput
										label={t("Y position")}
										value={selectedLayer.y}
										onChange={(y) => y !== null && updateLayer({ y })}
									/>
									<NumberInput
										label={t("Width")}
										value={selectedLayer.width}
										onChange={(width) =>
											width !== null && updateLayer({ width })
										}
									/>
									<NumberInput
										label={t("Height")}
										value={selectedLayer.height}
										onChange={(height) =>
											height !== null && updateLayer({ height })
										}
									/>
								</Grid>
								<HStack gap={2}>
									<Button
										label={t("Move forward")}
										variant="secondary"
										onClick={() =>
											mutateDraft((graph) =>
												moveStudioLayer(graph, selectedLayer.id, "up"),
											)
										}
									/>
									<Button
										label={t("Move backward")}
										variant="secondary"
										onClick={() =>
											mutateDraft((graph) =>
												moveStudioLayer(graph, selectedLayer.id, "down"),
											)
										}
									/>
								</HStack>
								<Button
									label={t("Delete source")}
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
							<Text color="secondary">{t("Select a source to edit it")}</Text>
						)}
					</VStack>
				</LayoutPanel>
			}
		>
			<LayoutContent padding={4}>
				<VStack gap={4}>
					{studio.data.settings.passthrough ? (
						<Banner
							container="section"
							status="warning"
							title={t("Cloud Studio unavailable — showing camera only")}
						/>
					) : null}
					{!online ? (
						<Banner
							container="section"
							status="warning"
							title={t("You are offline — saved program stays live")}
						/>
					) : null}
					<Text role="status">
						{save.isSuccess
							? t("Saved composition applied")
							: studio.data.settings.passthrough
								? t("Cloud Studio unavailable — showing camera only")
								: ""}
					</Text>
					<Grid columns={{ minWidth: 280, max: 2, repeat: "fit" }} gap={3}>
						<Card>
							<VStack gap={2}>
								<Text type="label">{t("Camera ingest")}</Text>
								<WhepPreview
									label={t("Camera ingest")}
									url={studio.data.preview?.camera}
								/>
							</VStack>
						</Card>
						<Card>
							<VStack gap={2}>
								<Text type="label">{t("Program")}</Text>
								<WhepPreview
									label={t("Program")}
									url={studio.data.preview?.program}
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
									"Text, PNG, browser, and VISP alerts are available.",
								)}
								actions={
									<Button
										isDisabled={readOnly}
										label={t("Add source")}
										variant="primary"
										onClick={() => setAddOpen(true)}
									/>
								}
							/>
						) : (
							<VStack gap={3}>
								<HStack hAlign="between">
									<Heading level={2}>{selectedScene.name}</Heading>
									<Button
										isDisabled={readOnly}
										label={t("Add source")}
										variant="primary"
										onClick={() => setAddOpen(true)}
									/>
								</HStack>
								<section
									aria-label={t("Composition canvas")}
									style={{
										aspectRatio: "16 / 9",
										background: "#111827",
										overflow: "hidden",
										position: "relative",
										width: "100%",
									}}
								>
									{[...selectedScene.layers]
										.sort((a, b) => a.zIndex - b.zIndex)
										.map((layer) => (
											<button
												aria-label={`${t("Edit source")} ${layer.name}`}
												key={layer.id}
												onClick={() => setSelectedLayerId(layer.id)}
												style={{
													background:
														layer.id === selectedLayerId
															? "rgba(37, 99, 235, 0.55)"
															: "rgba(15, 23, 42, 0.72)",
													border: studioLayerDisplayState(layer).failed
														? "2px solid #ef4444"
														: "1px solid #94a3b8",
													color: "white",
													height: `${(layer.height / 1080) * 100}%`,
													left: `${(layer.x / 1920) * 100}%`,
													overflow: "hidden",
													position: "absolute",
													top: `${(layer.y / 1080) * 100}%`,
													width: `${(layer.width / 1920) * 100}%`,
													zIndex: layer.zIndex,
												}}
												type="button"
											>
												{layer.type === "text"
													? layer.text
													: layer.type === "browser"
														? layer.url
														: layer.type === "alert"
															? `${t("Alert event")}: ${t(layer.event)}`
															: t("PNG overlay")}
												{studioLayerDisplayState(layer).failed
													? ` · ${t("Failed")}`
													: ""}
											</button>
										))}
								</section>
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
								<Button
									label={t("Text")}
									variant="secondary"
									onClick={() => addSource("text")}
								/>
								<FileInput
									accept="image/png"
									description={t("PNG, up to 10 MB.")}
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
									label={t("Browser source")}
									variant="secondary"
									onClick={() => addSource("browser")}
								/>
								<Button
									label={t("VISP alert")}
									variant="secondary"
									onClick={() => addSource("alert")}
								/>
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
								{t("Your studio has no sources yet. Go live anyway?")}
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
							<Text>{t("Save your changes before leaving?")}</Text>
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
									label={t("Save")}
									variant="primary"
									isDisabled={save.isPending}
									onClick={async () => {
										if (blocker.status !== "blocked" || !draft) return;
										await save.mutateAsync(draft);
										blocker.proceed();
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
