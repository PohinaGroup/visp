import { linkScopes, PROVIDER_SCOPES } from "@VISP/api/scopes";
import { LOW_LATENCY_DIRECT_WARNING } from "@VISP/api/srt-latency";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DocsHelpLink } from "@/components/docs-help-link";
import { trackEvent } from "@/lib/analytics";
import { authClient, authRedirectURL } from "@/lib/auth-client";
import { docs } from "@/lib/docs";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { DirectCustomDestinations } from "./direct-custom-destinations";
import {
	DEFAULT_PORTRAIT_CROP,
	DirectPortraitFraming,
	type PortraitCrop,
} from "./direct-portrait-framing";
import { providerLabel } from "./format";
import {
	Crosspoint,
	NoCrosspoint,
	ROUTE_STATE_LABEL,
	RouteName,
	RouteRow,
	RowAction,
	routingColumns,
} from "./routing";

const STATE_TONE = {
	live: "success",
	starting: "warning",
	retrying: "warning",
	// The ingest dropped but the broadcast is still up on the BRB card. Not an
	// error — the whole point is that nothing was lost.
	brb: "warning",
	stopping: "warning",
	failed: "error",
	stopped: "neutral",
} as const;

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
	const snapshots = useQuery(trpc.obs.snapshots.queryOptions());
	const [framing, setFraming] = useState<{
		pathId: number;
		provider: "twitch" | "kick" | "youtube";
		crop: PortraitCrop;
	} | null>(null);
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
	const setRole = useMutation(
		trpc.direct.setRole.mutationOptions({
			onSuccess: async (result) => {
				await queryClient.invalidateQueries();
				if (result.overCapacity) {
					toast.warning(
						t(
							"Portrait uses an extra Direct slot. It will not start until a slot is free.",
						),
					);
				}
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const saveCrop = useMutation(
		trpc.direct.saveCrop.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				setFraming(null);
				toast.success(t("Portrait framing saved"));
			},
			onError: () =>
				toast.error(
					t("Couldn’t save framing. Check your connection and retry."),
				),
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
				: await authClient.linkSocial({
						provider: provider,
						callbackURL,
						scopes,
					});
		if (result.error) {
			toast.error(result.error.message ?? t("Could not authorize"));
		}
	};

	const data = direct.data;
	const paths = data?.paths ?? [];
	const anyYoutube = paths.some((path) => path.youtube);
	const anyTwitch = paths.some((path) => path.twitch);
	const anyBoth = paths.some((path) => path.twitch && path.kick);
	const lockedPaths = paths.filter((path) => path.publishing);
	const lowLatencyPaths = paths.filter(
		(path) =>
			path.lowLatency &&
			(path.twitch ||
				path.kick ||
				path.youtube ||
				data?.customOutputs.some((output) => output.pathId === path.id)),
	);
	// With one device the column says it all; with several, name the device.
	const onDevice = (label: string, text: string) =>
		paths.length > 1 ? `${label}: ${text}` : text;

	return (
		<section className="flex flex-col gap-8" id="dashboard-direct">
			<div className="flex flex-col gap-2">
				<span className="flex items-center gap-2">
					<h2 className="font-bold font-display text-4xl uppercase leading-none tracking-tight">
						{t("Destinations")}
					</h2>
					<DocsHelpLink
						href={docs.directOutput}
						label={t("See how Direct output works")}
					/>
				</span>
				<p className="max-w-[60ch] text-muted-foreground leading-relaxed">
					{t(
						"Send a publishing device straight to Twitch, Kick, or YouTube without OBS. The relay encodes for each platform.",
					)}
				</p>
			</div>

			{data?.mode === "unconfigured" ? (
				<Banner
					description={t(
						"Your existing OBS workflow is unchanged. Authorize a destination and select it below when you are ready to switch to Direct.",
					)}
					status="info"
					title={t("Switch to Direct when you are ready")}
				/>
			) : null}

			{data && paths.length === 0 ? (
				<p className="border-muted-foreground border-l-2 px-4 py-3 text-sm">
					{t("Add a publishing device on the Devices tab, then route it here.")}
				</p>
			) : null}

			{data && paths.length > 0 ? (
				<div
					className="grid border-border border-b"
					style={routingColumns(paths.length)}
				>
					{/* Column heads: one per device, lit while it sends. */}
					<div className="col-span-full grid grid-cols-subgrid items-end pb-3">
						<span className="text-muted-foreground text-sm">
							{t("Platforms")}
						</span>
						{paths.map((path) => (
							<span
								className="flex min-w-0 flex-col items-center gap-1.5 text-center text-xs"
								key={path.id}
							>
								<span
									aria-hidden
									className={`size-2 ${path.publishing ? "tally-pulse bg-tally" : "border border-muted-foreground"}`}
								/>
								<span className="line-clamp-2 break-words">{path.label}</span>
							</span>
						))}
					</div>

					{data.providers.map((provider) => {
						const name = providerLabel(provider.provider);
						const routes = paths.filter((path) => path[provider.provider]);
						const portraits = data.directDualOutput
							? data.destinations.filter(
									(destination) =>
										destination.provider === provider.provider &&
										destination.role === "portrait",
								)
							: [];
						const portraitCandidates =
							data.directDualOutput &&
							provider.canReadStreamKey &&
							portraits.length === 0
								? paths.filter((path) => !path[provider.provider])
								: [];
						const status = !provider.linked
							? t("Not connected")
							: !provider.canReadStreamKey
								? t("Connected. Streaming is not authorized yet.")
								: routes.length === 0
									? t("Not routed from any device")
									: routes
											.map((path) => {
												const state = path.state[provider.provider];
												const error = path.error[provider.provider];
												return onDevice(
													path.label,
													`${t(ROUTE_STATE_LABEL[state ?? "stopped"])}${error ? ` (${error})` : ""}`,
												);
											})
											.join(", ");
						return (
							<RouteRow key={provider.provider}>
								<RouteName
									actions={
										provider.canReadStreamKey ? (
											<RowAction
												label={t("Reauthorize")}
												onClick={() => authorize(provider.provider)}
											/>
										) : (
											<span className="pl-2">
												<Button
													icon={
														<Icon color="inherit" icon={LinkIcon} size="sm" />
													}
													label={t("Authorize streaming")}
													size="sm"
													variant="primary"
													onClick={() => authorize(provider.provider)}
												/>
											</span>
										)
									}
									name={name}
									status={status}
								/>
								{paths.map((path) => {
									const on = path[provider.provider];
									if (!provider.canReadStreamKey && !on)
										return <NoCrosspoint key={path.id} />;
									const lastOutput =
										on &&
										Number(path.twitch) +
											Number(path.kick) +
											Number(path.youtube) ===
											1;
									return (
										<Crosspoint
											disabled={
												lastOutput || path.publishing || setOutputs.isPending
											}
											hint={t(
												lastOutput
													? "Switch Mode to Phone to your OBS to turn off Direct output"
													: "Stop this device before changing its Direct outputs",
											)}
											key={path.id}
											label={`${name}: ${path.label}`}
											on={on}
											state={path.state[provider.provider]}
											onChange={(value) =>
												setOutputs.mutate({
													pathId: path.id,
													twitch:
														provider.provider === "twitch"
															? value
															: path.twitch,
													kick:
														provider.provider === "kick" ? value : path.kick,
													youtube:
														provider.provider === "youtube"
															? value
															: path.youtube,
												})
											}
										/>
									);
								})}
								{provider.provider === "youtube" && anyYoutube ? (
									<div className="col-span-full">
										<YoutubeTitle
											saving={setYoutubeSettings.isPending}
											title={data.youtubeTitle}
											onSave={(title) => setYoutubeSettings.mutate({ title })}
										/>
									</div>
								) : null}
								{portraits.length || portraitCandidates.length ? (
									<div className="col-span-full flex flex-col gap-1 border-border border-l pl-4">
										{portraits.map((destination) => {
											const path = paths.find(
												(entry) => entry.id === destination.pathId,
											);
											return (
												<span
													className="flex flex-wrap items-center gap-x-2 text-sm"
													key={destination.id}
												>
													<span>
														{t("Portrait")}
														{path && paths.length > 1 ? ` · ${path.label}` : ""}
														:{" "}
														<span className="text-muted-foreground">
															{t(
																ROUTE_STATE_LABEL[
																	destination.state ?? "stopped"
																],
															)}
															{destination.error
																? ` (${destination.error})`
																: ""}
														</span>
													</span>
													<RowAction
														label={t("Edit framing")}
														onClick={() =>
															setFraming({
																pathId: destination.pathId,
																provider: destination.provider,
																crop: destination.crop ?? DEFAULT_PORTRAIT_CROP,
															})
														}
													/>
													<RowAction
														disabled={setRole.isPending}
														label={t("Remove portrait")}
														onClick={() =>
															setRole.mutate({
																pathId: destination.pathId,
																provider: destination.provider,
																role: "landscape",
															})
														}
													/>
												</span>
											);
										})}
										{portraitCandidates.map((path) => (
											<span className="-ml-2" key={path.id}>
												<RowAction
													disabled={setRole.isPending}
													label={
														paths.length > 1
															? `${t("Add portrait output")} · ${path.label}`
															: t("Add portrait output")
													}
													onClick={() => {
														void setRole
															.mutateAsync({
																pathId: path.id,
																provider: provider.provider,
																role: "portrait",
															})
															.then(() =>
																setFraming({
																	pathId: path.id,
																	provider: provider.provider,
																	crop: DEFAULT_PORTRAIT_CROP,
																}),
															);
													}}
												/>
											</span>
										))}
									</div>
								) : null}
							</RouteRow>
						);
					})}

					<DirectCustomDestinations />
				</div>
			) : null}

			{lockedPaths.length || lowLatencyPaths.length ? (
				<div className="flex flex-col gap-3">
					{lockedPaths.length ? (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<span aria-hidden className="tally-pulse size-2 bg-tally" />
							{t(
								"Routes are locked while a device is sending. Stop it in the app to change them.",
							)}
						</p>
					) : null}
					{lowLatencyPaths.map((path) => (
						<Banner
							description={t(LOW_LATENCY_DIRECT_WARNING)}
							key={path.id}
							status="warning"
							title={onDevice(
								path.label,
								t("Direct runs on a low-latency feed"),
							)}
						/>
					))}
				</div>
			) : null}

			{data ? (
				<Collapsible
					defaultIsOpen={false}
					trigger={<Text type="label">{t("Platform rules")}</Text>}
				>
					<VStack gap={3} paddingBlock={2}>
						{anyYoutube ? (
							<Banner
								description={t(
									"VISP creates a new public YouTube broadcast when this device starts publishing.",
								)}
								status="warning"
								title={t("YouTube broadcasts are public")}
							/>
						) : null}
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
						<Text type="label">{t("Using OBS alongside Direct")}</Text>
						<Text color="secondary" type="supporting">
							{t(
								"OBS can still read this feed for monitoring or recording, but do not let OBS stream to a provider VISP Direct already owns — that is two publishers on one stream key. What OBS reads is the contribution feed from your device, not the encode the platform receives.",
							)}
						</Text>
					</VStack>
				</Collapsible>
			) : null}

			{framing ? (
				<DirectPortraitFraming
					crop={framing.crop}
					isOpen
					previewUrl={
						snapshots.data?.find(
							(snapshot) => snapshot.pathId === framing.pathId,
						)?.url ?? null
					}
					saving={saveCrop.isPending}
					onClose={() => setFraming(null)}
					onSave={(crop) =>
						saveCrop.mutateAsync({
							pathId: framing.pathId,
							provider: framing.provider,
							crop,
						})
					}
				/>
			) : null}
		</section>
	);
}

// Read-only glance for the home tab: where each device is sending and whether
// it is on air. Changing anything happens on the Destinations tab.
export function DestinationsSummary({ onManage }: { onManage: () => void }) {
	const t = useT();
	const trpc = useTRPC();
	const direct = useQuery(trpc.direct.list.queryOptions());
	const providers = ["twitch", "kick", "youtube"] as const;
	const rows =
		direct.data?.paths.flatMap((path) =>
			providers
				.filter((provider) => path[provider])
				.map((provider) => ({ path, provider })),
		) ?? [];
	const custom = direct.data?.customOutputs ?? [];
	return (
		<Card>
			<VStack gap={2}>
				<HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
					<Heading level={2}>{t("Destinations")}</Heading>
					<Button label={t("Manage")} variant="ghost" onClick={onManage} />
				</HStack>
				{rows.length === 0 && custom.length === 0 ? (
					<Text color="secondary">{t("No platform connected yet.")}</Text>
				) : null}
				{rows.map(({ path, provider }) => {
					const state = path.state[provider] ?? "stopped";
					return (
						<HStack
							key={`${path.id}-${provider}`}
							gap={2}
							vAlign="center"
							wrap="wrap"
						>
							<StatusDot
								isPulsing={state === "live"}
								label={`${providerLabel(provider)} ${state}`}
								variant={STATE_TONE[state]}
							/>
							<Text type="supporting">
								{providerLabel(provider)} · {path.label}:{" "}
								{t(state === "brb" ? "showing BRB card" : state)}
							</Text>
						</HStack>
					);
				})}
				{custom.map((output) => {
					const state = output.state ?? "stopped";
					return (
						<HStack key={output.id} gap={2} vAlign="center" wrap="wrap">
							<StatusDot
								isPulsing={state === "live"}
								label={`${output.name} ${state}`}
								variant={STATE_TONE[state]}
							/>
							<Text type="supporting">
								{output.name}: {t(state === "brb" ? "showing BRB card" : state)}
							</Text>
						</HStack>
					);
				})}
			</VStack>
		</Card>
	);
}
