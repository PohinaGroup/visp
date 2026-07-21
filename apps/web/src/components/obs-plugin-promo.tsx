import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Heading, Text } from "@astryxdesign/core/Text";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { DocsHelpLink } from "@/components/docs-help-link";
import { docs } from "@/lib/docs";
import { legalEntity } from "@/lib/legal";
import {
	detectObsPluginPlatform,
	type ObsPluginRelease,
} from "@/lib/obs-releases";

export function ObsPluginPromo({
	release,
	destinationLabel,
}: {
	release: ObsPluginRelease | null;
	destinationLabel: string;
}) {
	return (
		<Card>
			<VStack gap={3}>
				<VStack gap={1}>
					<Text color="secondary" type="supporting">
						Recommended
					</Text>
					<HStack gap={1.5} vAlign="center">
						<Heading level={3}>VISP OBS plugin</Heading>
						<DocsHelpLink
							href={docs.obsRemoteControl}
							label="See how to pair the OBS plugin"
						/>
					</HStack>
					<Text color="secondary" type="supporting">
						Sign in from OBS in your browser, see your publishing devices, add a
						Media Source to the current scene in one click, and start/stop going
						live to {destinationLabel} — without pasting relay URLs by hand.
					</Text>
				</VStack>
				<List listStyle="decimal">
					<ListItem label="Install the VISP OBS plugin for your OS (beta)." />
					<ListItem label="In OBS, open Tools → VISP and sign in with Twitch or Kick in your browser." />
					<ListItem label="Approve the plugin, then use “Add to current scene” for your phone or other device." />
					<ListItem label="Go live from OBS as usual — your provider stream key never enters VISP." />
				</List>
				<HStack gap={2} wrap="wrap">
					<Button
						icon={<Icon color="inherit" icon={DownloadIcon} size="sm" />}
						label="Download OBS plugin"
						variant="primary"
						onClick={() => {
							const platform = detectObsPluginPlatform(navigator.userAgent);
							const asset = release?.assets.find(
								(candidate) => candidate.platform === platform,
							);
							window.open(
								asset?.downloadUrl ??
									release?.htmlUrl ??
									legalEntity.releasesUrl,
								"_blank",
								"noreferrer",
							);
						}}
					/>
					<Button
						icon={<Icon color="inherit" icon={ExternalLinkIcon} size="sm" />}
						label="Plugin docs"
						variant="secondary"
						onClick={() =>
							window.open(docs.obsRemoteControl, "_blank", "noreferrer")
						}
					/>
					<Button
						icon={<Icon color="inherit" icon={ExternalLinkIcon} size="sm" />}
						label="All downloads"
						variant="ghost"
						onClick={() => window.location.assign("/download")}
					/>
				</HStack>
				{release ? (
					<Text color="secondary" type="supporting">
						Latest beta: {release.tagName}
					</Text>
				) : null}
			</VStack>
		</Card>
	);
}
