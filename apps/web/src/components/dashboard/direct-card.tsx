import { linkScopes, PROVIDER_SCOPES } from "@VISP/api/scopes";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkIcon, ShieldIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DocsHelpLink } from "@/components/docs-help-link";
import { authClient, authRedirectURL } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { docs } from "@/lib/docs";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { providerLabel } from "./format";

const STATE_TONE = {
	live: "success",
	starting: "warning",
	retrying: "warning",
	// The ingest dropped but the broadcast is still up on the BRB card. Not an
	// error — the whole point is that nothing was lost.
	brb: "warning",
	failed: "error",
	stopped: "neutral",
} as const;

function ProviderState({
	provider,
	state,
	error,
}: {
	provider: "twitch" | "kick" | "youtube";
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
				{providerLabel(provider)}:{" "}
				{t(state === "brb" ? "showing BRB card" : state)}
			</Text>
			{error ? (
				<Text color="secondary" type="supporting">
					{error}
				</Text>
			) : null}
		</HStack>
	);
}

function YoutubeTitle({
	title,
	onSave,
	saving,
}: {
	title: string;
	onSave: (title: string) => void;
	saving: boolean;
}) {
	const t = useT();
	const [draft, setDraft] = useState(title);
	return (
		<HStack gap={2} vAlign="end" wrap="wrap">
			<TextInput
				label={t("Default YouTube broadcast title")}
				value={draft}
				onChange={(value) => setDraft(value)}
			/>
			<Button
				isDisabled={!draft.trim() || draft.trim() === title}
				isLoading={saving}
				label={t("Save title")}
				onClick={() => onSave(draft)}
			/>
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
	const setYoutubeSettings = useMutation(
		trpc.direct.setYoutubeSettings.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("YouTube title saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const authorizedRef = useRef<Record<string, boolean>>({});
	const authorizedInitialized = useRef(false);

	useEffect(() => {
		if (!direct.data) return;
		for (const provider of direct.data.providers) {
			const key = provider.provider;
			const wasAuthorized = authorizedRef.current[key];
			if (!authorizedInitialized.current) {
				authorizedRef.current[key] = provider.canReadStreamKey;
				continue;
			}
			if (provider.canReadStreamKey && wasAuthorized === false) {
				trackEvent("direct_authorized", { provider: key });
			}
			authorizedRef.current[key] = provider.canReadStreamKey;
		}
		authorizedInitialized.current = true;
	}, [direct.data]);

	// Re-request the union of granted scopes: asking only for the stream key
	// would drop this provider's chat and title/category consent.
	const authorize = async (provider: "twitch" | "kick" | "youtube") => {
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
			provider !== "kick"
				? await authClient.linkSocial({
						provider: provider === "youtube" ? "google" : provider,
						callbackURL,
						scopes,
					})
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
						<Heading level={2}>{t("Direct to Platform")}</Heading>
						<DocsHelpLink
							href={docs.directOutput}
							label={t("See how Direct output works")}
						/>
					</HStack>
					<Text color="secondary" type="supporting">
						{t(
							"Send a publishing device straight to Twitch, Kick, or YouTube without OBS. The relay encodes for each platform.",
						)}
					</Text>
				</VStack>

				{direct.data?.mode === "unconfigured" ? (
					<Banner
						description={t(
							"Your existing OBS workflow is unchanged. Authorize a destination and select it below when you are ready to switch to Direct.",
						)}
						status="info"
						title={t("Switch to Direct when you are ready")}
					/>
				) : null}

				{direct.data ? (
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
									<VStack gap={2}>
										{(["twitch", "kick", "youtube"] as const).map(
											(provider) => {
												const lastOutput =
													path[provider] &&
													Number(path.twitch) +
														Number(path.kick) +
														Number(path.youtube) ===
														1;
												return (
													<Switch
														key={provider}
														disabledMessage={t(
															lastOutput
																? "Choose Route to Home Studio above to turn off Direct output"
																: "Stop this device before changing its Direct outputs",
														)}
														isDisabled={
															lastOutput ||
															path.publishing ||
															setOutputs.isPending
														}
														label={providerLabel(provider)}
														labelSpacing="spread"
														value={path[provider]}
														onChange={(value) =>
															setOutputs.mutate({
																pathId: path.id,
																twitch:
																	provider === "twitch" ? value : path.twitch,
																kick: provider === "kick" ? value : path.kick,
																youtube:
																	provider === "youtube" ? value : path.youtube,
															})
														}
													/>
												);
											},
										)}
									</VStack>
									<ProviderState
										error={path.error.twitch}
										provider="twitch"
										state={path.state.twitch}
									/>
									<ProviderState
										error={path.error.youtube}
										provider="youtube"
										state={path.state.youtube}
									/>
									<ProviderState
										error={path.error.kick}
										provider="kick"
										state={path.state.kick}
									/>
								</VStack>
							</Card>
						))}

						<YoutubeTitle
							saving={setYoutubeSettings.isPending}
							title={direct.data.youtubeTitle}
							onSave={(title) => setYoutubeSettings.mutate({ title })}
						/>
						<Banner
							description={t(
								"VISP creates a new public YouTube broadcast when this device starts publishing.",
							)}
							status="warning"
							title={t("YouTube broadcasts are public")}
						/>

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
