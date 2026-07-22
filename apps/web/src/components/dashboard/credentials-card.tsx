import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadIcon, EyeIcon, RotateCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	downloadSceneCollection,
	RevealedValue,
	UrlWithFallback,
} from "@/components/credential-reveal";
import { docs } from "@/lib/docs";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { AdvancedSection } from "./advanced-section";
import { credentialsHint } from "./format";
import type { SecretBundle } from "./types";

export function CredentialsCard() {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const statusQuery = useQuery(trpc.secrets.status.queryOptions());
	const [bundle, setBundle] = useState<SecretBundle | null>(null);
	const rotate = useMutation(
		trpc.secrets.rotate.mutationOptions({
			onSuccess: async (result) => {
				setBundle(result);
				await queryClient.invalidateQueries();
				toast.success("OBS read credentials rotated");
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const reveal = useMutation(
		trpc.secrets.revealRead.mutationOptions({
			onSuccess: setBundle,
			onError: (error) => toast.error(error.message),
		}),
	);
	const configured = statusQuery.data?.readConfigured;
	const revealable = statusQuery.data?.readRevealable;

	return (
		<AdvancedSection
			action={
				configured ? (
					<Badge label={t("Configured")} variant="success" />
				) : (
					<Badge label={t("Setup required")} variant="warning" />
				)
			}
			docsHref={docs.getStarted}
			docsLabel="See how OBS read credentials fit into setup"
			id="obs-read"
			tag="Advanced · Relay to OBS"
			title={t("OBS read credentials")}
			value="obs-read"
		>
			<Text color="secondary" type="supporting">
				These URLs let OBS receive your feeds. Publish URLs are managed per
				device above.
			</Text>
			{bundle ? (
				<VStack gap={4}>
					<RevealedValue
						label={t("Read secret")}
						value={bundle.revealed.read}
					/>
					{bundle.urls.read.map((url) => (
						<VStack gap={2} key={url.slug}>
							<Text type="label">Read: {url.slug}</Text>
							<UrlWithFallback
								docsHref={docs.getStarted}
								docsLabel="See how to import this into OBS"
								label={t("OBS URL")}
								rtmp={url.rtmp}
								srt={url.srt}
							/>
						</VStack>
					))}
				</VStack>
			) : (
				<Text color="secondary" type="supporting">
					{t(credentialsHint({ configured, revealable }))}
				</Text>
			)}
			<HStack gap={2} wrap="wrap">
				{configured && revealable ? (
					<Button
						icon={<Icon color="inherit" icon={EyeIcon} size="sm" />}
						isLoading={reveal.isPending}
						label={t("Reveal read URLs")}
						variant="primary"
						onClick={() => reveal.mutate()}
					/>
				) : null}
				{configured ? (
					<Button
						icon={<Icon color="inherit" icon={RotateCwIcon} size="sm" />}
						isLoading={rotate.isPending}
						label={t("Rotate read")}
						onClick={() => {
							if (
								!revealable ||
								window.confirm(
									"Rotate read credentials? Existing OBS sources will stop working until you update them.",
								)
							) {
								rotate.mutate({ kind: "read" });
							}
						}}
					/>
				) : (
					<Button
						isLoading={rotate.isPending}
						label={t("Generate OBS credentials")}
						variant="primary"
						onClick={() => rotate.mutate({ kind: "read" })}
					/>
				)}
				{bundle?.sceneCollection ? (
					<Button
						icon={<Icon color="inherit" icon={DownloadIcon} size="sm" />}
						label={t("Download OBS collection")}
						onClick={() => downloadSceneCollection(bundle.sceneCollection)}
					/>
				) : null}
			</HStack>
		</AdvancedSection>
	);
}
