import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
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
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";

type Editor = {
	destination?: CustomDestinationMetadata;
	draft: CustomDestinationDraft;
};

export function DirectCustomDestinations() {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const list = useQuery(trpc.direct.custom.list.queryOptions());
	const [editor, setEditor] = useState<Editor | null>(null);
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
	const saving = create.isPending || update.isPending;
	const valid = Boolean(
		editor?.draft.name.trim() &&
			(editor.destination || editor?.draft.url.trim()),
	);

	return (
		<VStack gap={3}>
			<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
				<VStack gap={1}>
					<Heading level={3}>{t("Custom destinations")}</Heading>
					<Text color="secondary" type="supporting">
						{t(
							"Save RTMP, RTMPS, or SRT endpoints here. Credentials stay hidden after saving.",
						)}
					</Text>
				</VStack>
				<Button
					label={t("Add custom destination")}
					onClick={() => setEditor({ draft: customDestinationDraft() })}
				/>
			</HStack>
			{list.data?.destinations.length ? (
				<VStack gap={2}>
					{list.data.destinations.map((destination) => (
						<Card key={destination.id} padding={3} variant="muted">
							<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
								<VStack gap={1}>
									<HStack gap={2} vAlign="center">
										<Text type="label">{destination.name}</Text>
										<Badge
											label={destination.protocol.toUpperCase()}
											variant="neutral"
										/>
									</HStack>
									<Text color="secondary" type="code">
										{destination.endpointSummary}
									</Text>
								</VStack>
								<HStack gap={2}>
									<Button
										label={t("Edit")}
										variant="ghost"
										onClick={() =>
											setEditor({
												destination,
												draft: customDestinationDraft(destination),
											})
										}
									/>
									<Button
										isDisabled={remove.isPending}
										label={t("Delete")}
										variant="ghost"
										onClick={() =>
											remove.mutate({ destinationId: destination.id })
										}
									/>
								</HStack>
							</HStack>
						</Card>
					))}
				</VStack>
			) : (
				<Text color="secondary" type="supporting">
					{t("No custom destinations saved")}
				</Text>
			)}
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
		</VStack>
	);
}
