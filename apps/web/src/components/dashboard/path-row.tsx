import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, StackItem, VStack } from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	MaskedUrlWithFallback,
	SimpleUrl,
} from "@/components/credential-reveal";
import { docs } from "@/lib/docs";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { formatUtc, publishOriginLabel } from "./format";
import type { PathView } from "./types";

function PathStatus({ path }: { path: PathView }) {
	const t = useT();
	if (path.stale) {
		return (
			<HStack gap={1.5} vAlign="center">
				<StatusDot label={t("Status unknown")} variant="warning" />
				<Text color="secondary" type="supporting">
					{t("Status unknown")}
				</Text>
			</HStack>
		);
	}
	if (path.publishing) {
		return (
			<HStack gap={1.5} vAlign="center">
				<StatusDot isPulsing label={t("Live")} variant="error" />
				<Text type="supporting" weight="semibold">
					{t("Live")}
				</Text>
			</HStack>
		);
	}
	return (
		<HStack gap={1.5} vAlign="center">
			<StatusDot label={t("Offline")} variant="neutral" />
			<Text color="secondary" type="supporting">
				{t("Offline")}
			</Text>
		</HStack>
	);
}

export function PathRow({
	path,
	advancedMode,
}: {
	path: PathView;
	advancedMode: boolean;
}) {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [label, setLabel] = useState(path.label);
	const [labelSource, setLabelSource] = useState(path.label);
	if (path.label !== labelSource) {
		setLabelSource(path.label);
		setLabel(path.label);
	}

	const rename = useMutation(
		trpc.paths.rename.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Device renamed");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const reveal = useMutation(trpc.paths.reveal.mutationOptions());
	const revealRead = useMutation(trpc.secrets.revealRead.mutationOptions());
	const rotate = useMutation(
		trpc.paths.rotatePublish.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Publish URL rotated for this device");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const revoke = useMutation(
		trpc.paths.revoke.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success("Path revoked");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const publishUrl = async (protocol: "srt" | "rtmp") =>
		(await reveal.mutateAsync({ pathId: path.id })).urls[protocol];
	const readUrl = async (protocol: "srt" | "rtmp") => {
		const url = (await revealRead.mutateAsync()).urls.read.find(
			(candidate) => candidate.slug === path.slug,
		);
		if (!url) throw new Error("Read URL is not available");
		return url[protocol];
	};

	return (
		<Collapsible
			defaultIsOpen={false}
			trigger={
				<HStack gap={3} vAlign="center" width="100%" wrap="wrap">
					<StackItem size="fill">
						<VStack gap={0.5}>
							<Text type="label">{path.label}</Text>
							<Text color="secondary" type="supporting">
								{path.publishLastConnectedAt
									? `Last connected ${formatUtc(path.publishLastConnectedAt)}`
									: "Never connected"}
							</Text>
						</VStack>
					</StackItem>
					<PathStatus path={path} />
				</HStack>
			}
		>
			<VStack gap={3} paddingBlock={2}>
				{advancedMode ? (
					<>
						{path.maskedUrls.publish ? (
							<MaskedUrlWithFallback
								docsHref={docs.videoSource}
								docsLabel="See how to add this to your video source"
								getRtmp={() => publishUrl("rtmp")}
								getSrt={() => publishUrl("srt")}
								label={t("Sending URL")}
								rtmp={path.maskedUrls.publish.rtmp}
								srt={path.maskedUrls.publish.srt}
							/>
						) : null}
						{path.maskedUrls.read ? (
							<MaskedUrlWithFallback
								docsHref={docs.getStarted}
								docsLabel="See how to import this into OBS"
								getRtmp={() => readUrl("rtmp")}
								getSrt={() => readUrl("srt")}
								label={t("OBS read URL")}
								rtmp={path.maskedUrls.read.rtmp}
								srt={path.maskedUrls.read.srt}
							/>
						) : null}
					</>
				) : (
					<>
						{path.maskedUrls.read ? (
							<SimpleUrl
								copyValue={() => readUrl("srt")}
								docsHref={docs.getStarted}
								docsLabel="See how to import this into OBS"
								label={t("Add this to OBS or other streaming software")}
								url={path.maskedUrls.read.srt}
							/>
						) : null}
						{path.maskedUrls.publish ? (
							<SimpleUrl
								copyValue={() => publishUrl("srt")}
								docsHref={docs.videoSource}
								docsLabel="See how to add this to your video source"
								label={t("Add this to video source")}
								url={path.maskedUrls.publish.srt}
							/>
						) : null}
					</>
				)}
				<Collapsible
					defaultIsOpen={false}
					trigger={
						<Text color="secondary" type="supporting">
							Manage device
						</Text>
					}
				>
					<VStack gap={3} paddingBlock={2}>
						<HStack gap={2} vAlign="center" wrap="wrap">
							<Text type="code">{path.slug}</Text>
							<Badge
								label={publishOriginLabel(path.publishOrigin)}
								variant="neutral"
							/>
						</HStack>
						<HStack gap={2} vAlign="end" wrap="wrap">
							<TextInput
								label={t("Device name")}
								size="sm"
								value={label}
								onChange={setLabel}
							/>
							<Button
								isDisabled={
									rename.isPending || !label.trim() || label === path.label
								}
								label={t("Save")}
								size="sm"
								onClick={() => rename.mutate({ pathId: path.id, label })}
							/>
						</HStack>
						<HStack gap={2} wrap="wrap">
							<Button
								icon={<Icon color="inherit" icon={RotateCwIcon} size="sm" />}
								isLoading={rotate.isPending}
								label={
									path.publishRevealable
										? "Rotate this device"
										: "Create device URL"
								}
								size="sm"
								onClick={() => {
									const warning = path.publishRevealable
										? `Rotate ${path.label}? Its current publish URL will stop working.`
										: `Create a device URL for ${path.label}? Its legacy account-wide URL will stop working on this path.`;
									if (window.confirm(warning)) {
										rotate.mutate({ pathId: path.id });
									}
								}}
							/>
							<Button
								icon={<Icon color="inherit" icon={Trash2Icon} size="sm" />}
								isLoading={revoke.isPending}
								label={t("Revoke")}
								size="sm"
								variant="destructive"
								onClick={() => {
									if (
										window.confirm(
											`Revoke ${path.slug}? This slug can never be reused.`,
										)
									) {
										revoke.mutate({ pathId: path.id });
									}
								}}
							/>
						</HStack>
					</VStack>
				</Collapsible>
			</VStack>
		</Collapsible>
	);
}
