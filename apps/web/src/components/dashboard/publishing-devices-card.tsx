import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SimpleUrl, UrlWithFallback } from "@/components/credential-reveal";
import { DocsHelpLink } from "@/components/docs-help-link";
import { docs } from "@/lib/docs";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { PathRow } from "./path-row";
import type { CreatedDevice } from "./types";

export function PublishingDevicesCard({
	onRedoSetup,
}: {
	onRedoSetup: () => void;
}) {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [label, setLabel] = useState("");
	const [created, setCreated] = useState<CreatedDevice | null>(null);
	const statusQuery = useQuery(trpc.secrets.status.queryOptions());
	const advancedMode = statusQuery.data?.advancedMode ?? false;
	const pathsQuery = useQuery(
		trpc.paths.list.queryOptions(undefined, { refetchInterval: 5000 }),
	);
	const create = useMutation(
		trpc.paths.create.mutationOptions({
			onSuccess: async (result) => {
				setCreated(result);
				setLabel("");
				await queryClient.invalidateQueries();
				toast.success(t("Publishing device created"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const paths = pathsQuery.data ?? [];

	return (
		<Card>
			<VStack gap={4}>
				<HStack gap={1.5} vAlign="center">
					<Heading level={2}>{t("Video sources")}</Heading>
					<DocsHelpLink
						href={docs.videoSource}
						label={t("See how to add a video source")}
					/>
				</HStack>

				{created ? (
					<Banner
						defaultIsExpanded
						status="success"
						title={`${created.path.label} is ready`}
					>
						<VStack gap={3}>
							{advancedMode ? (
								<Text color="secondary" type="supporting">
									Add the receiving URL to your streaming software and the
									sending URL to your sending device to start streaming.
								</Text>
							) : null}
							{created.read ? (
								advancedMode ? (
									<UrlWithFallback
										docsHref={docs.getStarted}
										docsLabel="See how to import this into OBS"
										label={t("Receiving URL")}
										rtmp={created.read.rtmp}
										srt={created.read.srt}
									/>
								) : (
									<SimpleUrl
										copyValue={created.read.srt}
										docsHref={docs.getStarted}
										docsLabel="See how to import this into OBS"
										label={t("Add this to OBS or other streaming software")}
										url={created.read.srt}
									/>
								)
							) : (
								<Text color="secondary" type="supporting">
									Receiving URL is unavailable until OBS read credentials are
									set up.
								</Text>
							)}
							{advancedMode ? (
								<UrlWithFallback
									docsHref={docs.videoSource}
									docsLabel="See how to add this to your video source"
									label={t("Sending URL")}
									rtmp={created.urls.rtmp}
									srt={created.urls.srt}
								/>
							) : (
								<SimpleUrl
									copyValue={created.urls.srt}
									docsHref={docs.videoSource}
									docsLabel="See how to add this to your video source"
									label={t("Add this to video source")}
									url={created.urls.srt}
								/>
							)}
							<HStack>
								<Button
									label={t("Dismiss")}
									size="sm"
									variant="ghost"
									onClick={() => setCreated(null)}
								/>
							</HStack>
						</VStack>
					</Banner>
				) : null}

				{paths.length > 0 ? (
					<VStack gap={3}>
						{paths.map((path) => (
							<Card key={path.id} padding={3}>
								<PathRow advancedMode={advancedMode} path={path} />
							</Card>
						))}
					</VStack>
				) : (
					<EmptyState
						description={t("Create a device for your first video source.")}
						isCompact
						title={t("No publishing devices")}
					/>
				)}

				<Divider />

				<HStack gap={2} vAlign="end" wrap="wrap">
					<TextInput
						label={t("Device name")}
						placeholder={t("Main phone")}
						value={label}
						onChange={setLabel}
					/>
					<Button
						icon={<Icon color="inherit" icon={PlusIcon} size="sm" />}
						isDisabled={create.isPending || !label.trim()}
						label={t("Add device")}
						variant="primary"
						onClick={() => create.mutate({ label })}
					/>
				</HStack>
				<HStack gap={2} wrap="wrap">
					<Button
						label={t("Redo setup")}
						variant="secondary"
						onClick={onRedoSetup}
					/>
					<Text color="secondary" type="supporting">
						Offers wipe or keep existing devices.
					</Text>
				</HStack>
			</VStack>
		</Card>
	);
}
