import { env } from "@VISP/env/web";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { DownloadIcon, MonitorIcon, PowerIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RevealedValue } from "@/components/credential-reveal";
import { DocsHelpLink } from "@/components/docs-help-link";
import { docs } from "@/lib/docs";
import { useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { obsStatusMessage } from "./format";
import type { ObsPairing } from "./types";

function downloadObsConfig(token: string) {
	const serverUrl = import.meta.env.PROD
		? window.location.origin
		: env.VITE_SERVER_URL.replace(/\/$/, "");
	const contents = `[visp]\ncontrol_url=${serverUrl}/api/obs/control\ntoken=${token}\n`;
	const anchor = document.createElement("a");
	anchor.href = URL.createObjectURL(
		new Blob([contents], { type: "text/plain" }),
	);
	anchor.download = "config.ini";
	anchor.click();
	URL.revokeObjectURL(anchor.href);
}

export function ObsControlCard() {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const statusQuery = useQuery(
		trpc.obs.status.queryOptions(undefined, { refetchInterval: 3000 }),
	);
	const [pairing, setPairing] = useState<ObsPairing | null>(null);
	const pair = useMutation(
		trpc.obs.pair.mutationOptions({
			onSuccess: async (result) => {
				setPairing(result);
				await queryClient.invalidateQueries();
				toast.success(t("OBS pairing token created"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const setStreaming = useMutation(
		trpc.obs.setStreaming.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const status = statusQuery.data;
	const connected = Boolean(status?.connected);
	const streaming = Boolean(status?.streaming);

	return (
		<Card>
			<VStack gap={4}>
				<VStack gap={1}>
					<HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
						<HStack gap={1.5} vAlign="center">
							<Heading level={2}>{t("OBS")}</Heading>
							<DocsHelpLink
								href={docs.obsRemoteControl}
								label={t("See how to pair the OBS plugin")}
							/>
						</HStack>
						<HStack gap={1.5} vAlign="center">
							<StatusDot
								label={t(connected ? "Connected" : "Disconnected")}
								variant={connected ? "success" : "neutral"}
							/>
							<Text color="secondary" type="supporting">
								{t(connected ? "Connected" : "Disconnected")}
							</Text>
						</HStack>
					</HStack>
					<Text type="supporting">
						{t("The OBS plugin is live in beta")}{" "}
						<Link to="/download" style={{ textDecoration: "underline" }}>
							{t("Download the plugin")}
						</Link>
					</Text>
				</VStack>

				<Text color="secondary">{t(obsStatusMessage(status))}</Text>

				<Collapsible
					defaultIsOpen={false}
					trigger={<Text type="label">{t("Plugin pairing")}</Text>}
				>
					<VStack gap={3} paddingBlock={2}>
						<Text color="secondary" type="supporting">
							{t(
								"Install the beta plugin from the download page, then in OBS open Tools → VISP Remote Control and click Sign in with browser. Approve the code here, and the dashboard shows Connected within a few seconds.",
							)}
						</Text>
						{pairing ? (
							<RevealedValue
								label={t("OBS pairing token")}
								value={pairing.token}
							/>
						) : null}
						<HStack gap={2} wrap="wrap">
							<Button
								icon={<Icon color="inherit" icon={MonitorIcon} size="sm" />}
								isLoading={pair.isPending}
								label={
									status?.configured
										? t("Rotate pairing token")
										: t("Generate pairing token")
								}
								onClick={() => {
									if (
										!status?.configured ||
										window.confirm(t("Replace the current OBS pairing token?"))
									) {
										pair.mutate();
									}
								}}
							/>
							{pairing ? (
								<Button
									icon={<Icon color="inherit" icon={DownloadIcon} size="sm" />}
									label={t("Download plugin config")}
									onClick={() => downloadObsConfig(pairing.token)}
								/>
							) : null}
						</HStack>
					</VStack>
				</Collapsible>

				<HStack>
					<Button
						icon={<Icon color="inherit" icon={PowerIcon} size="sm" />}
						isDisabled={
							!connected || Boolean(status?.pending) || setStreaming.isPending
						}
						label={t(streaming ? "Stop OBS stream" : "Start OBS stream")}
						variant="primary"
						onClick={() => setStreaming.mutate({ streaming: !streaming })}
					/>
				</HStack>
			</VStack>
		</Card>
	);
}
