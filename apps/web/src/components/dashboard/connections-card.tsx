import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkIcon, MessageCircleIcon, UnlinkIcon } from "lucide-react";
import { toast } from "sonner";
import { DocsHelpLink } from "@/components/docs-help-link";
import { authClient, authRedirectURL } from "@/lib/auth-client";
import { docs } from "@/lib/docs";
import { useLocale, useT } from "@/lib/i18n";
import { useTRPC } from "@/utils/trpc";
import { providerLabel } from "./format";
import type { ChatConnection } from "./types";

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

	const link = async (provider: "twitch" | "kick", chatConsent = false) => {
		const result =
			provider === "twitch"
				? await authClient.linkSocial({
						provider,
						callbackURL: authRedirectURL(`/dashboard${fi ? "?lang=fi" : ""}`),
						// Twitch tokens keep only the last-requested scopes, so always
						// re-request the union or one feature's consent drops the other's.
						scopes: chatConsent
							? ["user:read:chat", "channel:manage:broadcast"]
							: undefined,
					})
				: await authClient.oauth2.link({
						providerId: provider,
						callbackURL: authRedirectURL(`/dashboard${fi ? "?lang=fi" : ""}`),
						errorCallbackURL: authRedirectURL(
							`/dashboard?error=kick_link_failed${fi ? "&lang=fi" : ""}`,
						),
					});
		if (result.error) {
			toast.error(result.error.message ?? `Could not link ${provider}`);
		}
	};

	const unlink = async (provider: "twitch" | "kick", enabled: boolean) => {
		if (enabled) await disable.mutateAsync({ provider });
		const result = await authClient.unlinkAccount({ providerId: provider });
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
			</VStack>
		</Card>
	);
}
