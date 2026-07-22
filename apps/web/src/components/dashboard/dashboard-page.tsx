import { Center } from "@astryxdesign/core/Center";
import { CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { SeppoWidget } from "@/components/seppo-widget";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { ChainStrip } from "./chain-strip";
import { ConnectionsCard } from "./connections-card";
import { CredentialsCard } from "./credentials-card";
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
	const statusQuery = useQuery(trpc.secrets.status.queryOptions());
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
							"Devices publish to the relay, OBS reads the feeds, you go on air. Your provider stream key never enters VISP.",
						)}
						title={t("Dashboard")}
					/>
					<ChainStrip />
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
							<ObsControlCard />
							<ConnectionsCard />
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
										<CredentialsCard />
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
