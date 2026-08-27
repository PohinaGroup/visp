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
import { ArrowDownIcon, ArrowUpIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { brbRefetchInterval } from "@/lib/brb-highlights";
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

async function highlightMetadata(file: File) {
	const bytes = new Uint8Array(await file.arrayBuffer());
	let h264 = false;
	for (let i = 0; i <= bytes.length - 4; i++) {
		if (
			bytes[i] === 0x61 &&
			bytes[i + 1] === 0x76 &&
			bytes[i + 2] === 0x63 &&
			bytes[i + 3] === 0x31
		) {
			h264 = true;
			break;
		}
	}
	const digest = Array.from(
		new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
	)
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	const video = document.createElement("video");
	const url = URL.createObjectURL(file);
	try {
		video.preload = "metadata";
		video.src = url;
		await new Promise<void>((resolve, reject) => {
			video.onloadedmetadata = () => resolve();
			video.onerror = () => reject(new Error("metadata"));
		});
		return {
			codec: h264 ? "avc1" : "",
			durationMs: Math.round(video.duration * 1000),
			width: video.videoWidth,
			height: video.videoHeight,
			checksum: digest,
		};
	} finally {
		URL.revokeObjectURL(url);
	}
}

function duration(ms: number) {
	return `${Math.floor(ms / 60_000)}:${Math.floor((ms % 60_000) / 1000)
		.toString()
		.padStart(2, "0")}`;
}

type Highlight = {
	id: string;
	label: string;
	durationMs: number;
	enabled: boolean;
	url: string | null;
};

type HighlightSettings = {
	muted: boolean;
	overlay: boolean;
	clips: Highlight[];
	maxClips: number;
	maxBytes: number;
	maxDurationMs: number;
	lastResult: { played: number; at: string } | null;
};

function HighlightsSection({ settings }: { settings: HighlightSettings }) {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const seenResult = useRef<string | null | undefined>(undefined);
	const invalidate = () => queryClient.invalidateQueries();
	const uploadUrl = useMutation(trpc.brb.highlightUploadUrl.mutationOptions());
	const confirm = useMutation(trpc.brb.confirmHighlight.mutationOptions());
	const mutationOptions = {
		onError: (error: { message: string }) => {
			toast.error(error.message);
		},
	};
	const update = useMutation(
		trpc.brb.updateHighlight.mutationOptions(mutationOptions),
	);
	const reorder = useMutation(
		trpc.brb.reorderHighlights.mutationOptions(mutationOptions),
	);
	const remove = useMutation(
		trpc.brb.deleteHighlight.mutationOptions(mutationOptions),
	);
	const prefs = useMutation(
		trpc.brb.updateHighlightPrefs.mutationOptions(mutationOptions),
	);
	const clips = settings.clips;

	useEffect(() => {
		const result = settings.lastResult;
		const key = result?.at ?? null;
		if (seenResult.current === undefined) {
			seenResult.current = key;
			return;
		}
		if (!result || !key || key === seenResult.current) return;
		seenResult.current = key;
		toast(
			result.played > 0
				? t("Played {n} highlights").replace("{n}", String(result.played))
				: t("Highlights unavailable — showed still"),
		);
	}, [settings.lastResult, t]);

	const upload = async (files: File[]) => {
		setUploading(true);
		setUploadError(null);
		let successes = 0;
		const failures: string[] = [];
		for (const file of files.slice(0, settings.maxClips - clips.length)) {
			try {
				if (file.type !== "video/mp4")
					throw new Error(t("Use an MP4 (H.264) video"));
				if (file.size > settings.maxBytes)
					throw new Error(t("That clip is over 25 MB"));
				const metadata = await highlightMetadata(file);
				if (!metadata.codec) throw new Error(t("Use an MP4 (H.264) video"));
				if (metadata.durationMs > settings.maxDurationMs)
					throw new Error(t("That clip is over 30 seconds"));
				const target = await uploadUrl.mutateAsync();
				const response = await fetch(target.url, {
					method: "PUT",
					body: file,
					headers: { "Content-Type": "video/mp4" },
				});
				if (!response.ok) throw new Error(t("Upload failed, try again"));
				await confirm.mutateAsync({
					id: target.id,
					uploadId: target.uploadId,
					filename: file.name,
					label: file.name.replace(/\.mp4$/i, ""),
				});
				successes++;
			} catch (error) {
				failures.push(error instanceof Error ? error.message : String(error));
			}
		}
		await invalidate();
		if (successes) toast.success(t("Clip uploaded"));
		if (failures.length) {
			const message = failures.join(" · ");
			setUploadError(message);
			toast.error(message);
		}
		setUploading(false);
	};

	const move = async (index: number, offset: number) => {
		const ids = clips.map((clip) => clip.id);
		[ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
		try {
			await reorder.mutateAsync({ ids });
			await invalidate();
			toast.success(t("Highlight order saved"));
		} catch {
			// The mutation's shared onError owns the toast.
		}
	};
	const mutate = (promise: Promise<unknown>) =>
		void promise.then(invalidate).catch(() => undefined);

	return (
		<VStack gap={3}>
			<Heading level={3}>{t("Highlights")}</Heading>
			<FileInput
				accept="video/mp4"
				description={t("MP4 (H.264), up to 30 seconds and 25 MB. Max 5 clips.")}
				isDisabled={clips.length >= settings.maxClips}
				disabledMessage={t("Highlights library is full (5 clips)")}
				isLoading={uploading}
				isMultiple
				label={t("Upload highlights")}
				maxFiles={settings.maxClips - clips.length}
				maxSize={settings.maxBytes}
				mode="dropzone"
				status={
					uploadError ? { type: "error", message: uploadError } : undefined
				}
				value={null}
				onChange={(value) => {
					const files = Array.isArray(value) ? value : value ? [value] : [];
					if (files.length) void upload(files);
				}}
			/>
			{clips.length === 0 ? (
				<Text color="secondary" type="supporting">
					{t("Still plays until you add clips")}
				</Text>
			) : (
				clips.map((clip, index) => (
					<VStack gap={2} key={clip.id}>
						<HStack gap={2} vAlign="center" wrap="wrap">
							<Text>{clip.label}</Text>
							<Text color="secondary" type="supporting">
								{duration(clip.durationMs)}
							</Text>
							<Button
								icon={<Icon color="inherit" icon={ArrowUpIcon} size="sm" />}
								isDisabled={index === 0}
								label={t("Move up")}
								variant="ghost"
								onClick={() => void move(index, -1)}
							/>
							<Button
								icon={<Icon color="inherit" icon={ArrowDownIcon} size="sm" />}
								isDisabled={index === clips.length - 1}
								label={t("Move down")}
								variant="ghost"
								onClick={() => void move(index, 1)}
							/>
							<Button
								label={t("Rename")}
								variant="ghost"
								onClick={() => {
									const label = window.prompt(t("Rename"), clip.label);
									if (label !== null)
										mutate(update.mutateAsync({ id: clip.id, label }));
								}}
							/>
							<Button
								icon={<Icon color="inherit" icon={Trash2Icon} size="sm" />}
								label={t("Remove clip")}
								variant="ghost"
								onClick={() =>
									void remove
										.mutateAsync({ id: clip.id })
										.then(async () => {
											await invalidate();
											toast.success(t("Clip removed"));
										})
										.catch(() => undefined)
								}
							/>
						</HStack>
						<Switch
							label={t("Enabled")}
							value={clip.enabled}
							onChange={(enabled) =>
								mutate(update.mutateAsync({ id: clip.id, enabled }))
							}
						/>
						{clip.url ? (
							<video
								className="w-full rounded-[var(--radius)]"
								controls
								muted={settings.muted}
								src={clip.url}
							/>
						) : null}
					</VStack>
				))
			)}
			<Switch
				label={t("Play clip audio")}
				labelSpacing="spread"
				value={!settings.muted}
				onChange={(audio) => mutate(prefs.mutateAsync({ muted: !audio }))}
			/>
			<Switch
				label={t("Show BRB message on highlights")}
				labelSpacing="spread"
				value={settings.overlay}
				onChange={(overlay) => mutate(prefs.mutateAsync({ overlay }))}
			/>
			{clips.some((clip) => clip.enabled) ? (
				<Text color="secondary" type="supporting">
					{t("Highlights will play on next BRB")}
				</Text>
			) : null}
			{settings.lastResult ? (
				<Text color="secondary" type="supporting">
					{settings.lastResult.played > 0
						? t("Played {n} highlights").replace(
								"{n}",
								String(settings.lastResult.played),
							)
						: t("Highlights unavailable — showed still")}
				</Text>
			) : null}
		</VStack>
	);
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
	const brb = useQuery({
		...trpc.brb.get.queryOptions(),
		refetchInterval: (query) => brbRefetchInterval(query.state.data),
	});
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

						{settings.highlights.enabled ? (
							<HighlightsSection settings={settings.highlights} />
						) : null}
					</>
				) : null}
			</VStack>
		</Card>
	);
}
