import { type ChatProvider, chatAuthProvider } from "@VISP/api/chat/contract";
import { linkScopes, PROVIDER_SCOPES } from "@VISP/api/scopes";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	LinkIcon,
	MessageCircleIcon,
	MonitorIcon,
	Trash2Icon,
	UnlinkIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RevealedValue } from "@/components/credential-reveal";
import { DocsHelpLink } from "@/components/docs-help-link";
import { authClient, authRedirectURL } from "@/lib/auth-client";
import { docs } from "@/lib/docs";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { providerLabel } from "./format";
import type { ChatConnection } from "./types";

function overlayUrl(token: string) {
	return `${window.location.origin}/overlay?t=${token}`;
}

function ChatOverlayBlock() {
	const t = useT();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const statusQuery = useQuery(trpc.chat.overlay.status.queryOptions());
	// Held in state only: the URL is never retrievable again after this render.
	const [url, setUrl] = useState<string | null>(null);
	const issue = useMutation(
		trpc.chat.overlay.issue.mutationOptions({
			onSuccess: async ({ token }) => {
				setUrl(overlayUrl(token));
				await queryClient.invalidateQueries();
				toast.success(t("Overlay URL created"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const revoke = useMutation(
		trpc.chat.overlay.revoke.mutationOptions({
			onSuccess: async () => {
				setUrl(null);
				await queryClient.invalidateQueries();
				toast.success(t("Overlay URL revoked"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const configured = Boolean(statusQuery.data?.configured);

	return (
		<Collapsible
			defaultIsOpen={false}
			trigger={<Text type="label">{t("OBS chat overlay")}</Text>}
		>
			<VStack gap={3} paddingBlock={2}>
				<Text color="secondary" type="supporting">
					{t(
						"Add a Browser Source in OBS and paste this URL. It shows the chats you enabled above, on a transparent background. Append &corner=top-right, &rows=3, &fade=1, or &debug=1 to change it.",
					)}
				</Text>
				{url ? (
					<HStack gap={2} vAlign="center" wrap="wrap">
						<RevealedValue label={t("Browser Source URL")} value={url} />
						<Button
							label={t("Preview")}
							variant="secondary"
							onClick={() =>
								window.open(`${url}&debug=1`, "_blank", "noreferrer")
							}
						/>
					</HStack>
				) : null}
				<HStack gap={2} wrap="wrap">
					<Button
						icon={<Icon color="inherit" icon={MonitorIcon} size="sm" />}
						isLoading={issue.isPending}
						label={
							configured ? t("Rotate overlay URL") : t("Generate overlay URL")
						}
						onClick={() => {
							if (
								!configured ||
								window.confirm(
									t("Replace the overlay URL already pasted into OBS?"),
								)
							) {
								issue.mutate();
							}
						}}
					/>
					{configured ? (
						<Button
							icon={<Icon color="inherit" icon={Trash2Icon} size="sm" />}
							isLoading={revoke.isPending}
							label={t("Revoke overlay URL")}
							variant="ghost"
							onClick={() => {
								if (
									window.confirm(t("Stop the OBS chat overlay from loading?"))
								) {
									revoke.mutate();
								}
							}}
						/>
					) : null}
				</HStack>
			</VStack>
		</Collapsible>
	);
}

function ConnectionActions({
	connection,
	canUnlink,
	isEnablePending,
	isDisablePending,
	onLink,
	onEnable,
	onDisable,
	onUnlink,
}: {
	connection: ChatConnection;
	canUnlink: boolean;
	isEnablePending: boolean;
	isDisablePending: boolean;
	onLink: (chatConsent?: boolean) => void;
	onEnable: () => void;
	onDisable: () => void;
	onUnlink: () => void;
}) {
	const t = useT();
	if (!connection.linked) {
		return (
			<Button
				icon={<Icon color="inherit" icon={LinkIcon} size="sm" />}
				label={t("Link")}
				onClick={() => onLink()}
			/>
		);
	}

	let chatAction = (
		<Button
			icon={<Icon color="inherit" icon={MessageCircleIcon} size="sm" />}
			isLoading={isEnablePending}
			label={t("Enable chat")}
			variant="primary"
			onClick={onEnable}
		/>
	);
	if (connection.needsConsent) {
		chatAction = (
			<Button
				icon={<Icon color="inherit" icon={MessageCircleIcon} size="sm" />}
				label={t("Authorize chat")}
				variant="primary"
				onClick={() => onLink(true)}
			/>
		);
	} else if (connection.enabled) {
		chatAction = (
			<Button
				isLoading={isDisablePending}
				label={t("Disable chat")}
				onClick={onDisable}
			/>
		);
	}

	return (
		<>
			{chatAction}
			<Button
				icon={<Icon color="inherit" icon={UnlinkIcon} size="sm" />}
				isDisabled={!canUnlink || isDisablePending}
				label={t("Unlink")}
				variant="ghost"
				onClick={onUnlink}
			/>
		</>
	);
}

export function ConnectionsCard() {
	const t = useT();
	const fi = useLocale() === "fi";
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const connections = useQuery(trpc.chat.connections.list.queryOptions());
	const enable = useMutation(
		trpc.chat.connections.enable.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("Chat enabled"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const disable = useMutation(
		trpc.chat.connections.disable.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
				toast.success(t("Chat disabled"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const link = async (provider: ChatProvider, chatConsent = false) => {
		const granted =
			connections.data?.find((entry) => entry.provider === provider)
				?.grantedScopes ?? [];
		const scopes = linkScopes(
			provider,
			granted,
			chatConsent ? PROVIDER_SCOPES[provider].chat : [],
		);
		const callbackURL = authRedirectURL(`/dashboard${fi ? "?lang=fi" : ""}`);
		const result =
			provider !== "kick"
				? await authClient.linkSocial({
						provider: chatAuthProvider(provider),
						callbackURL,
						scopes,
					})
				: await authClient.oauth2.link({
						providerId: provider,
						callbackURL,
						errorCallbackURL: authRedirectURL(
							`/dashboard?error=kick_link_failed${fi ? "&lang=fi" : ""}`,
						),
						scopes,
					});
		if (result.error) {
			toast.error(result.error.message ?? `Could not link ${provider}`);
		}
	};

	const unlink = async (provider: ChatProvider, enabled: boolean) => {
		if (enabled) await disable.mutateAsync({ provider });
		const result = await authClient.unlinkAccount({
			providerId: chatAuthProvider(provider),
		});
		if (result.error) {
			toast.error(result.error.message ?? `Could not unlink ${provider}`);
			return;
		}
		await queryClient.invalidateQueries();
		toast.success(`${providerLabel(provider)} ${t("unlinked")}`);
	};

	const linkedCount =
		connections.data?.filter((connection) => connection.linked).length ?? 0;

	return (
		<Card id="dashboard-connections">
			<VStack gap={4}>
				<VStack gap={1}>
					<HStack gap={1.5} vAlign="center">
						<Heading level={2}>{t("Chat connections")}</Heading>
						<DocsHelpLink
							href={docs.phoneApp}
							label={t("See how chat works in the phone and browser app")}
						/>
					</HStack>
					<Text color="secondary" type="supporting">
						{t(
							"Link either provider for login, then opt into its read-only live chat separately.",
						)}
					</Text>
				</VStack>
				{connections.data?.map((connection) => {
					const label = providerLabel(connection.provider);
					return (
						<Card key={connection.provider} padding={3} variant="muted">
							<HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
								<VStack gap={1}>
									<HStack gap={2} vAlign="center">
										<Text type="label">{label}</Text>
										<Badge
											label={t(connection.linked ? "Linked" : "Not linked")}
											variant="neutral"
										/>
										{connection.enabled ? (
											<Badge label={t("Chat on")} variant="success" />
										) : null}
									</HStack>
									<Text color="secondary" type="supporting">
										{connection.enabled
											? t("Messages can appear in VISP Native.")
											: t("Chat is disabled.")}
									</Text>
								</VStack>
								<HStack gap={2} wrap="wrap">
									<ConnectionActions
										canUnlink={linkedCount >= 2}
										connection={connection}
										isDisablePending={disable.isPending}
										isEnablePending={enable.isPending}
										onDisable={() =>
											disable.mutate({ provider: connection.provider })
										}
										onEnable={() =>
											enable.mutate({ provider: connection.provider })
										}
										onLink={(chatConsent) =>
											void link(connection.provider, chatConsent)
										}
										onUnlink={() =>
											void unlink(connection.provider, connection.enabled)
										}
									/>
								</HStack>
							</HStack>
						</Card>
					);
				})}
				<Text color="secondary" type="supporting">
					{t(
						"Disabling chat keeps the provider available for sign-in. At least one login must remain linked.",
					)}
				</Text>
				<ChatOverlayBlock />
			</VStack>
		</Card>
	);
}
