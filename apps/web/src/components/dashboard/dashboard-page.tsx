import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { SeppoWidget } from "@/components/seppo-widget";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { BrbCard } from "./brb-card";
import { ChainStrip } from "./chain-strip";
import { ChatBotCard } from "./chat-bot-card";
import { ConnectionsCard } from "./connections-card";
import { CredentialsCard } from "./credentials-card";
import { DirectCard } from "./direct-card";
import { GuidanceCard } from "./guidance-card";
import { ObsControlCard } from "./obs-control-card";
import { PublishingDevicesCard } from "./publishing-devices-card";
import { SetupCard } from "./setup-card";
import type { AdvancedSectionId, DashboardMode } from "./types";
import {
	seppoToolActivityLabel,
	useDashboardSeppo,
} from "./use-dashboard-seppo";

function isAdvancedSectionId(value: string): value is AdvancedSectionId {
	return value === "obs-read" || value === "tuning" || value === "reference";
}

export function DashboardPage() {
	const t = useT();
	const locale = useLocale();
	const fi = locale === "fi";
	const trpc = useTRPC();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const statusQuery = useQuery(trpc.secrets.status.queryOptions());
	const directQuery = useQuery(trpc.direct.list.queryOptions());
	const studioQuery = useQuery(trpc.studio.get.queryOptions());
	const setOperationalMode = useMutation(
		trpc.direct.setMode.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("Primary mode saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const advancedMode = statusQuery.data?.advancedMode ?? false;
	const {
		open: seppoOpen,
		setOpen: setSeppoOpen,
		advancedSections,
		setAdvancedSections,
		setAdvanced,
		handleToolCall,
	} = useDashboardSeppo(advancedMode);

	const mode: DashboardMode = advancedMode ? "advanced" : "simple";
	const operationalMode = directQuery.data?.mode;
	const chooseOperationalMode = (value: string) => {
		if (value === "direct") {
			navigate({
				to: "/setup",
				search: {
					lang: locale === "fi" ? "fi" : undefined,
					redo: true,
					redoMode: "additive",
				},
			});
			return;
		}
		if (
			operationalMode !== "direct" ||
			window.confirm(
				t(
					"Switch to Route to Home Studio? This turns off every Direct platform output.",
				),
			)
		) {
			setOperationalMode.mutate({ mode: "obs" });
		}
	};

	return (
		<>
			<Center axis="horizontal">
				<VStack gap={6} maxWidth={1180} padding={4} width="100%">
					<PageHeader
						actions={
							<SegmentedControl
								label={t("Dashboard detail level")}
								value={mode}
								onChange={(value) =>
									setAdvanced.mutate({ advancedMode: value === "advanced" })
								}
							>
								<SegmentedControlItem label={t("Simple")} value="simple" />
								<SegmentedControlItem label={t("Advanced")} value="advanced" />
							</SegmentedControl>
						}
						eyebrow={t("Live signal path")}
						subtitle={t(
							"Choose one primary publishing path. Direct sends the feed to a platform; Home Studio sends it to OBS, which owns the platform output.",
						)}
						title={t("Dashboard")}
					/>
					<Card>
						<VStack gap={2}>
							<Heading level={2}>{t("Primary operational mode")}</Heading>
							<Text color="secondary" type="supporting">
								{t(
									"Select where the final stream is produced. These modes are separate and cannot run as one output path.",
								)}
							</Text>
							<SegmentedControl
								isDisabled={!operationalMode || setOperationalMode.isPending}
								label={t("Primary operational mode")}
								layout="fill"
								value={
									operationalMode === "unconfigured"
										? ""
										: (operationalMode ?? "")
								}
								onChange={chooseOperationalMode}
							>
								<SegmentedControlItem
									label={t("Direct to Platform")}
									value="direct"
								/>
								<SegmentedControlItem
									label={t("Route to Home Studio")}
									value="obs"
								/>
							</SegmentedControl>
						</VStack>
					</Card>
					{studioQuery.data?.settings.available ? (
						<Card>
							<VStack gap={2}>
								<Heading level={2}>{t("Cloud Studio")}</Heading>
								<Text color="secondary" type="supporting">
									{t(
										"Build the saved program that Direct sends to your platforms.",
									)}
								</Text>
								<Button
									href={`/studio${locale === "fi" ? "?lang=fi" : ""}`}
									label={t("Open Studio")}
									variant="primary"
								/>
							</VStack>
						</Card>
					) : null}
					{operationalMode && operationalMode !== "unconfigured" ? (
						<ChainStrip />
					) : null}
					<Grid columns={{ minWidth: 440, repeat: "fit" }} gap={4}>
						<PublishingDevicesCard
							onRedoSetup={() =>
								navigate({
									to: "/setup",
									search: {
										lang: locale === "fi" ? "fi" : undefined,
										redo: true,
									},
								})
							}
						/>
						<VStack gap={4}>
							{operationalMode === "direct" ? (
								<>
									<DirectCard />
									<BrbCard />
								</>
							) : null}
							{operationalMode === "obs" ? <ObsControlCard /> : null}
							<ConnectionsCard />
							<ChatBotCard />
							{advancedMode ? (
								<VStack gap={2}>
									<Text color="secondary" type="supporting">
										{t("Advanced")}
									</Text>
									<CollapsibleGroup
										hasDividers
										type="multiple"
										value={advancedSections}
										onChange={(value) => {
											const next = Array.isArray(value) ? value : [value];
											setAdvancedSections(next.filter(isAdvancedSectionId));
										}}
									>
										{operationalMode === "obs" ? <CredentialsCard /> : null}
										<GuidanceCard />
										<SetupCard />
									</CollapsibleGroup>
								</VStack>
							) : null}
						</VStack>
					</Grid>
				</VStack>
			</Center>
			<SeppoWidget
				context="dashboard"
				open={seppoOpen}
				placeholder={
					fi ? "Kysy hallintapaneelistasi…" : "Ask about your dashboard…"
				}
				subtitle={
					fi
						? "Hallintapaneelin apu — voi tarkistaa tilan ja opastaa käyttöönotossa"
						: "Dashboard help — can inspect status and guide setup"
				}
				suggestions={
					fi
						? [
								"Miksi laitteeni ei ole yhteydessä?",
								"Auta yhdistämään OBS",
								"Tarkista hallintapaneelini asetukset",
							]
						: [
								"Why is my device offline?",
								"Help me connect OBS",
								"Check my dashboard setup",
							]
				}
				welcome={
					fi
						? "Hei, olen Seppo. Voin tarkistaa hallintapaneelin turvalliset tilatiedot, selvittää signaalipolun ongelmia ja avata oikeat käyttöönoton ohjaimet."
						: "Hi, I'm Seppo. I can inspect the safe status shown on this dashboard, troubleshoot your signal path, and open the right setup controls."
				}
				onOpenChange={setSeppoOpen}
				onToolCall={handleToolCall}
				toolActivityLabel={seppoToolActivityLabel}
			/>
		</>
	);
}
