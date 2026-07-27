import { linkScopes, PROVIDER_SCOPES } from "@VISP/api/scopes";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import {
	SegmentedControl,
	SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkIcon, ShieldIcon } from "lucide-react";
import { toast } from "sonner";
import { DocsHelpLink } from "@/components/docs-help-link";
import { authClient, authRedirectURL } from "@/lib/auth-client";
import { docs } from "@/lib/docs";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { providerLabel } from "./format";
import type { DirectOutputs, DirectSelection } from "./types";

function selectionOf(path: DirectOutputs["paths"][number]): DirectSelection {
	if (path.twitch && path.kick) return "both";
	if (path.twitch) return "twitch";
	if (path.kick) return "kick";
	return "off";
}

function outputsOf(selection: DirectSelection) {
	return {
		twitch: selection === "twitch" || selection === "both",
		kick: selection === "kick" || selection === "both",
	};
}

const STATE_TONE = {
	live: "success",
	starting: "warning",
	retrying: "warning",
	failed: "error",
	stopped: "neutral",
} as const;

function ProviderState({
	provider,
	state,
	error,
}: {
	provider: "twitch" | "kick";
	state: keyof typeof STATE_TONE | null;
	error: string | null;
}) {
	const t = useT();
	if (!state) return null;
	return (
		<HStack gap={2} vAlign="center" wrap="wrap">
			<StatusDot
				isPulsing={state === "live"}
				label={`${providerLabel(provider)} ${state}`}
				variant={STATE_TONE[state]}
			/>
			<Text type="supporting">
				{providerLabel(provider)}: {t(state)}
			</Text>
			{error ? (
				<Text color="secondary" type="supporting">
					{error}
				</Text>
			) : null}
		</HStack>
	);
}

export function DirectCard() {
	const t = useT();
	const fi = useLocale() === "fi";
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const direct = useQuery(trpc.direct.list.queryOptions());
	const setOutputs = useMutation(
		trpc.direct.setOutputs.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("Direct output saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	// Re-request the union of granted scopes: asking only for the stream key
	// would drop this provider's chat and title/category consent.
	const authorize = async (provider: "twitch" | "kick") => {
		const granted =
			direct.data?.providers.find((entry) => entry.provider === provider)
				?.grantedScopes ?? [];
		const scopes = linkScopes(
			provider,
			granted,
			PROVIDER_SCOPES[provider].streamKeyRequest,
		);
		const callbackURL = authRedirectURL(`/dashboard${fi ? "?lang=fi" : ""}`);
		const result =
			provider === "twitch"
				? await authClient.linkSocial({ provider, callbackURL, scopes })
				: await authClient.oauth2.link({
						providerId: provider,
						callbackURL,
						scopes,
					});
		if (result.error) {
			toast.error(result.error.message ?? t("Could not authorize"));
		}
	};

	const anyTwitch = direct.data?.paths.some((path) => path.twitch) ?? false;
	const anyBoth =
		direct.data?.paths.some((path) => path.twitch && path.kick) ?? false;

	return (
		<Card id="dashboard-direct">
			<VStack gap={4}>
				<VStack gap={1}>
					<HStack gap={1.5} vAlign="center">
						<Heading level={2}>{t("Direct output")}</Heading>
						<DocsHelpLink
							href={docs.directOutput}
							label={t("See how Direct output works")}
						/>
					</HStack>
					<Text color="secondary" type="supporting">
						{t(
							"Send a publishing device straight to Twitch or Kick, without OBS. The relay encodes for the platform.",
						)}
					</Text>
				</VStack>

				{direct.data && !direct.data.betaEnabled ? (
					<Banner
						description={t(
							"Direct runs the platform encode on a single relay node, so access is handed out a few accounts at a time.",
						)}
						status="info"
						title={t("VISP Direct is in limited beta")}
					/>
				) : null}

				{direct.data?.betaEnabled ? (
					<>
						{direct.data.providers.map((provider) => (
							<Card key={provider.provider} padding={3} variant="muted">
								<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
									<HStack gap={2} vAlign="center">
										<Text type="label">{providerLabel(provider.provider)}</Text>
										<Badge
											label={t(provider.linked ? "Linked" : "Not linked")}
											variant="neutral"
										/>
										{provider.canReadStreamKey ? (
											<Badge label={t("Authorized")} variant="success" />
										) : null}
									</HStack>
									<Button
										icon={
											<Icon
												color="inherit"
												icon={provider.linked ? ShieldIcon : LinkIcon}
												size="sm"
											/>
										}
										label={
											provider.canReadStreamKey
												? t("Reauthorize")
												: t("Authorize streaming")
										}
										variant={provider.canReadStreamKey ? "ghost" : "primary"}
										onClick={() => authorize(provider.provider)}
									/>
								</HStack>
							</Card>
						))}

						{direct.data.paths.map((path) => (
							<Card key={path.id} padding={3} variant="muted">
								<VStack gap={2}>
									<HStack gap={2} vAlign="center" wrap="wrap">
										<Text type="label">{path.label}</Text>
										{path.publishing ? (
											<Badge label={t("Publishing")} variant="success" />
										) : null}
									</HStack>
									<SegmentedControl
										isDisabled={path.publishing || setOutputs.isPending}
										disabledMessage={t(
											"Stop this device before changing its Direct outputs",
										)}
										label={t("Direct output for this device")}
										layout="fill"
										value={selectionOf(path)}
										onChange={(value) =>
											setOutputs.mutate({
												pathId: path.id,
												...outputsOf(value as DirectSelection),
											})
										}
									>
										<SegmentedControlItem label={t("Off")} value="off" />
										<SegmentedControlItem label="Twitch" value="twitch" />
										<SegmentedControlItem label="Kick" value="kick" />
										<SegmentedControlItem label={t("Both")} value="both" />
									</SegmentedControl>
									<ProviderState
										error={path.error.twitch}
										provider="twitch"
										state={path.state.twitch}
									/>
									<ProviderState
										error={path.error.kick}
										provider="kick"
										state={path.state.kick}
									/>
								</VStack>
							</Card>
						))}

						<Banner
							description={t(
								"OBS can still read this feed for monitoring or recording, but do not let OBS stream to a provider VISP Direct already owns — that is two publishers on one stream key. What OBS reads is the contribution feed from your device, not the encode the platform receives.",
							)}
							status="warning"
							title={t("Keep OBS off the same destination")}
						/>

						{anyTwitch ? (
							<Banner
								description={t(
									"Twitch's simulcasting terms prohibit showing activity from another platform on the Twitch stream, so do not burn Kick chat into the video. Floating chat stays fine — only you see it.",
								)}
								status="warning"
								title={t("Do not put Kick chat on the Twitch stream")}
							/>
						) : null}

						{anyBoth ? (
							<Banner
								description={t(
									"Kick Partners must switch on Kick's own Multistreaming toggle. Kick currently reduces Partner Program payout for the duration of a multistreaming session.",
								)}
								status="warning"
								title={t("Kick Partners: enable Multistreaming")}
							/>
						) : null}
					</>
				) : null}
			</VStack>
		</Card>
	);
}
