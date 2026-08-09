import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";

type BrbSource = "snapshot" | "image" | "color";

const ACCEPTED = { "image/png": true, "image/jpeg": true } as const;

function isAcceptedType(type: string): type is keyof typeof ACCEPTED {
	return type in ACCEPTED;
}

function ago(iso: string, t: (value: string) => string) {
	const seconds = Math.max(
		0,
		Math.round((Date.now() - Date.parse(iso)) / 1000),
	);
	if (seconds < 90) return `${seconds}s ${t("ago")}`;
	return `${Math.round(seconds / 60)} min ${t("ago")}`;
}

/** What viewers see: the chosen background with the message drawn over it. */
function CardPreview({
	url,
	message,
	caption,
}: {
	url: string | null;
	message: string;
	caption: string | null;
}) {
	return (
		<VStack gap={1}>
			<span className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-[var(--radius)] border border-border bg-black">
				{url ? (
					<img
						alt=""
						className="absolute inset-0 size-full object-cover blur-[2px]"
						src={url}
					/>
				) : null}
				<span className="relative max-w-[80%] truncate rounded-[var(--radius)] bg-black/50 px-3 py-1.5 text-center font-medium text-sm text-white">
					{message}
				</span>
			</span>
			{caption ? (
				<Text color="secondary" type="supporting">
					{caption}
				</Text>
			) : null}
		</VStack>
	);
}

export function BrbCard() {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const brb = useQuery(trpc.brb.get.queryOptions());
	const [draft, setDraft] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);

	const update = useMutation(
		trpc.brb.update.mutationOptions({
			onSuccess: async () => {
				setDraft(null);
				await queryClient.invalidateQueries();
				toast.success(t("BRB card saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const imageUploadUrl = useMutation(trpc.brb.imageUploadUrl.mutationOptions());
	const clearImage = useMutation(
		trpc.brb.clearImage.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("BRB image removed"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const settings = brb.data;
	if (!settings) return null;

	const message = draft ?? settings.message;
	const save = (over: Partial<{ enabled: boolean; source: BrbSource }> = {}) =>
		update.mutate({
			enabled: settings.enabled,
			message,
			source: settings.source,
			...over,
		});

	const upload = async (file: File) => {
		if (!isAcceptedType(file.type)) {
			toast.error(t("Use a PNG or JPEG image"));
			return;
		}
		if (file.size > settings.maxImageBytes) {
			toast.error(t("That image is over 5 MB"));
			return;
		}
		setUploading(true);
		try {
			const target = await imageUploadUrl.mutateAsync({
				contentType: file.type,
			});
			const response = await fetch(target.url, {
				method: "PUT",
				body: file,
				headers: { "Content-Type": file.type },
			});
			if (!response.ok) throw new Error(t("Upload failed, try again"));
			await queryClient.invalidateQueries();
			toast.success(t("BRB image uploaded"));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : String(error));
		} finally {
			setUploading(false);
		}
	};

	const snapshot = settings.snapshots.at(0);
	const preview =
		settings.source === "image"
			? { url: settings.imageUrl, caption: null }
			: settings.source === "snapshot"
				? {
						url: snapshot?.url ?? null,
						caption: snapshot?.capturedAt
							? `${t("From your stream")}, ${ago(snapshot.capturedAt, t)}`
							: t(
									"Your latest frame will be used once you have streamed once.",
								),
					}
				: { url: null, caption: null };

	return (
		<Card id="dashboard-brb">
			<VStack gap={4}>
				<VStack gap={1}>
					<HStack gap={2} vAlign="center" wrap="wrap">
						<Heading level={2}>{t("Never drop again")}</Heading>
						{settings.enabled ? (
							<Badge label={t("On")} variant="success" />
						) : null}
					</HStack>
					<Text color="secondary" type="supporting">
						{t(
							"When your ingest drops, VISP keeps the outgoing stream running and shows this card instead. Your hosts stay, and the VOD does not split.",
						)}
					</Text>
				</VStack>

				<Switch
					label={t("Show a BRB card when my stream drops")}
					labelSpacing="spread"
					value={settings.enabled}
					onChange={(value) => save({ enabled: value })}
				/>

				{settings.enabled ? (
					<>
						<HStack gap={2} vAlign="end" wrap="wrap">
							<TextInput
								label={t("Message")}
								placeholder={settings.defaultMessage}
								value={message}
								onChange={(value) => setDraft(value)}
							/>
							<Button
								isDisabled={draft === null || draft === settings.message}
								isLoading={update.isPending}
								label={t("Save message")}
								onClick={() => save()}
							/>
						</HStack>

						<SegmentedControl
							label={t("BRB background")}
							value={settings.source}
							onChange={(value) => save({ source: value as BrbSource })}
						>
							<SegmentedControlItem
								label={t("Latest snapshot")}
								value="snapshot"
							/>
							<SegmentedControlItem label={t("Custom image")} value="image" />
							<SegmentedControlItem label={t("Solid black")} value="color" />
						</SegmentedControl>

						{settings.source === "image" ? (
							<VStack gap={2}>
								<FileInput
									accept="image/png,image/jpeg"
									description={t("PNG or JPEG, up to 5 MB.")}
									isLoading={uploading}
									label={t("BRB image")}
									maxSize={settings.maxImageBytes}
									mode="dropzone"
									value={null}
									onChange={(file) => {
										const picked = Array.isArray(file) ? file.at(0) : file;
										if (picked) void upload(picked);
									}}
								/>
								{settings.hasImage ? (
									<Button
										icon={<Icon color="inherit" icon={Trash2Icon} size="sm" />}
										isLoading={clearImage.isPending}
										label={t("Remove image")}
										variant="ghost"
										onClick={() => clearImage.mutate()}
									/>
								) : null}
							</VStack>
						) : null}

						<CardPreview
							caption={preview.caption}
							message={message.trim() || settings.defaultMessage}
							url={preview.url}
						/>
					</>
				) : null}
			</VStack>
		</Card>
	);
}
