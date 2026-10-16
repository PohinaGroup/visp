import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
	type CustomDestinationDraft,
	type CustomDestinationMetadata,
	customDestinationDraft,
	customDestinationUpdateInput,
} from "@/lib/custom-direct-destinations";
import {
	type CustomDirectOutput,
	customOutputStatus,
	customOutputsForPath,
} from "@/lib/custom-direct-output";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import {
	DEFAULT_PORTRAIT_CROP,
	DirectPortraitFraming,
	type PortraitCrop,
} from "./direct-portrait-framing";
import {
	Crosspoint,
	ROUTE_STATE_LABEL,
	RouteName,
	RouteRow,
	type RouteState,
	RowAction,
} from "./routing";

type Editor = {
	destination?: CustomDestinationMetadata;
	draft: CustomDestinationDraft;
};

export function DirectCustomDestinations() {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const list = useQuery(trpc.direct.custom.list.queryOptions());
	const direct = useQuery(trpc.direct.list.queryOptions());
	const snapshots = useQuery(trpc.obs.snapshots.queryOptions());
	const [editor, setEditor] = useState<Editor | null>(null);
	const [framing, setFraming] = useState<{
		outputId: string;
		pathId: number;
		crop: PortraitCrop;
	} | null>(null);
	const refresh = async () => {
		await queryClient.invalidateQueries();
		setEditor(null);
	};
	const create = useMutation(
		trpc.direct.custom.create.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success(t("Custom destination saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const update = useMutation(
		trpc.direct.custom.update.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success(t("Custom destination saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const remove = useMutation(
		trpc.direct.custom.delete.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success(t("Custom destination deleted"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const assign = useMutation(
		trpc.direct.custom.assign.mutationOptions({
			onSuccess: async () => {
				await refresh();
				toast.success(t("Direct output saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const setRole = useMutation(
		trpc.direct.setCustomRole.mutationOptions({
			onSuccess: () => queryClient.invalidateQueries(),
			onError: (error) => toast.error(error.message),
		}),
	);
	const saveCrop = useMutation(
		trpc.direct.saveCustomCrop.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setFraming(null);
				toast.success(t("Portrait framing saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const saving = create.isPending || update.isPending;
	const valid = Boolean(
		editor?.draft.name.trim() &&
			(editor.destination || editor?.draft.url.trim()),
	);

	const paths = direct.data?.paths ?? [];
	const stateLabel = (output?: CustomDirectOutput) => {
		const state = output?.state as RouteState | undefined;
		return (
			output?.error ??
			t(ROUTE_STATE_LABEL[state ?? "stopped"] ?? customOutputStatus(output))
		);
	};

	return (
		<>
			<div className="col-span-full flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pt-10 pb-3">
				<span className="text-muted-foreground text-sm">
					{t("Custom destinations")}
				</span>
				<span className="-mr-2">
					<RowAction
						label={t("Add custom destination")}
						onClick={() => setEditor({ draft: customDestinationDraft() })}
					/>
				</span>
			</div>
			{list.data && list.data.destinations.length === 0 ? (
				<p className="col-span-full max-w-[60ch] border-border border-t py-4 text-muted-foreground text-sm">
					{t(
						"Save RTMP, RTMPS, or SRT endpoints here. Credentials stay hidden after saving.",
					)}
				</p>
			) : null}
			{list.data?.destinations.map((destination) => {
				const routes = paths.flatMap((path) => {
					const outputs = customOutputsForPath(
						direct.data?.customOutputs ?? [],
						destination.id,
						path.id,
					);
					return outputs.landscape ? [{ path, ...outputs }] : [];
				});
				const live = routes.some(({ path }) => path.publishing);
				return (
					<RouteRow key={destination.id}>
						<RouteName
							actions={
								<>
									<RowAction
										disabled={live}
										label={t("Edit")}
										onClick={() =>
											setEditor({
												destination,
												draft: customDestinationDraft(destination),
											})
										}
									/>
									<RowAction
										disabled={remove.isPending}
										label={t("Delete")}
										onClick={() => {
											if (
												window.confirm(
													t(
														"Delete this destination? You need its full URL to add it again.",
													),
												)
											) {
												remove.mutate({ destinationId: destination.id });
											}
										}}
									/>
								</>
							}
							meta={
								<span className="break-all font-mono text-muted-foreground text-xs">
									{destination.endpointSummary}
								</span>
							}
							name={destination.name}
							status={
								routes.length === 0
									? t("Not routed from any device")
									: routes
											.map(({ path, landscape }) =>
												paths.length > 1
													? `${path.label}: ${stateLabel(landscape)}`
													: stateLabel(landscape),
											)
											.join(", ")
							}
						/>
						{paths.map((path) => {
							const { landscape } = customOutputsForPath(
								direct.data?.customOutputs ?? [],
								destination.id,
								path.id,
							);
							const enabled = Boolean(landscape);
							return (
								<Crosspoint
									disabled={assign.isPending || (path.publishing && !enabled)}
									hint={t(
										"Stop this device before changing its Direct outputs",
									)}
									key={path.id}
									label={`${destination.name}: ${path.label}`}
									on={enabled}
									state={(landscape?.state as RouteState) ?? null}
									onChange={(value) =>
										assign.mutate({
											destinationId: destination.id,
											pathId: path.id,
											enabled: value,
										})
									}
								/>
							);
						})}
						{direct.data?.directDualOutput && routes.length ? (
							<div className="col-span-full flex flex-col gap-1 border-border border-l pl-4">
								{routes.map(({ path, landscape, portrait }) =>
									portrait ? (
										<span
											className="flex flex-wrap items-center gap-x-2 text-sm"
											key={path.id}
										>
											<span>
												{t("Portrait")}
												{paths.length > 1 ? ` · ${path.label}` : ""}:{" "}
												<span className="text-muted-foreground">
													{stateLabel(portrait)}
												</span>
											</span>
											<RowAction
												disabled={path.publishing}
												label={t("Edit framing")}
												onClick={() =>
													setFraming({
														outputId: portrait.id,
														pathId: path.id,
														crop: portrait.crop ?? DEFAULT_PORTRAIT_CROP,
													})
												}
											/>
											<RowAction
												disabled={setRole.isPending}
												label={t("Remove portrait")}
												onClick={() =>
													setRole.mutate({
														outputId: portrait.id,
														pathId: path.id,
														role: "landscape",
													})
												}
											/>
										</span>
									) : (
										<span className="-ml-2" key={path.id}>
											<RowAction
												disabled={path.publishing || setRole.isPending}
												label={
													paths.length > 1
														? `${t("Add portrait output")} · ${path.label}`
														: t("Add portrait output")
												}
												onClick={() => {
													if (!landscape) return;
													void setRole
														.mutateAsync({
															outputId: landscape.id,
															pathId: path.id,
															role: "portrait",
														})
														.then((result) =>
															setFraming({
																outputId: result.outputId,
																pathId: path.id,
																crop: DEFAULT_PORTRAIT_CROP,
															}),
														);
												}}
											/>
										</span>
									),
								)}
							</div>
						) : null}
					</RouteRow>
				);
			})}
			{editor ? (
				<Dialog
					isOpen
					purpose="form"
					width={560}
					onOpenChange={(open) => !open && setEditor(null)}
				>
					<VStack gap={4} padding={4}>
						<DialogHeader
							title={t(
								editor.destination
									? "Edit custom destination"
									: "Add custom destination",
							)}
						/>
						<TextInput
							label={t("Destination name")}
							value={editor.draft.name}
							onChange={(name) =>
								setEditor({ ...editor, draft: { ...editor.draft, name } })
							}
						/>
						{editor.destination ? (
							<Text color="secondary" type="supporting">
								{t("Current endpoint")}: {editor.destination.endpointSummary}
							</Text>
						) : null}
						<div className="rr-block" data-rybbit-block>
							<TextInput
								label={t(
									editor.destination
										? "Replacement URL (optional)"
										: "Destination URL",
								)}
								placeholder="rtmps://ingest.example.com/app/key"
								value={editor.draft.url}
								onChange={(url) =>
									setEditor({ ...editor, draft: { ...editor.draft, url } })
								}
							/>
						</div>
						<Text color="secondary" type="supporting">
							{t(
								"Only the protocol, host, and explicit port are shown after saving.",
							)}
						</Text>
						<HStack gap={2} hAlign="end">
							<Button
								label={t("Cancel")}
								variant="ghost"
								onClick={() => setEditor(null)}
							/>
							<Button
								isDisabled={!valid}
								isLoading={saving}
								label={t("Save destination")}
								onClick={() => {
									if (editor.destination) {
										update.mutate(
											customDestinationUpdateInput(
												editor.destination.id,
												editor.draft,
											),
										);
										return;
									}
									create.mutate({
										name: editor.draft.name.trim(),
										url: editor.draft.url.trim(),
									});
								}}
							/>
						</HStack>
					</VStack>
				</Dialog>
			) : null}
			{framing ? (
				<DirectPortraitFraming
					crop={framing.crop}
					isOpen
					previewUrl={
						snapshots.data?.find(
							(snapshot) => snapshot.pathId === framing.pathId,
						)?.url ?? null
					}
					saving={saveCrop.isPending}
					onClose={() => setFraming(null)}
					onSave={(crop) =>
						saveCrop.mutateAsync({
							outputId: framing.outputId,
							pathId: framing.pathId,
							crop,
						})
					}
				/>
			) : null}
		</>
	);
}
