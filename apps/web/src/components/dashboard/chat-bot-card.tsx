import type { ChatProvider } from "@VISP/api/chat/contract";
import { PROVIDER_SCOPES } from "@VISP/api/scopes";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Icon } from "@astryxdesign/core/Icon";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	MessageCircleIcon,
	SendIcon,
	ShieldCheckIcon,
	Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DocsHelpLink } from "@/components/docs-help-link";
import { docs } from "@/lib/docs";
import { useLocale, useT } from "@/lib/i18n";
import { linkProvider } from "@/lib/link-provider";
import { useTRPC } from "@/utils/trpc";
import { providerLabel } from "./format";
import { AffiliateNote, UpgradeButton, usePlan } from "./plan-card";

const PROVIDERS = ["twitch", "kick", "youtube"] as const;

const MODERATOR_EVENTS = [
	{ key: "onRaid", label: "Welcome raids" },
	{ key: "onGift", label: "Thank gifted subs and cheers" },
	{ key: "onSignal", label: "Warn chat when the signal degrades" },
	{ key: "onQuestions", label: "Answer unanswered stream questions" },
] as const;

const MAX_TIMEOUT_SECONDS = 1_209_600;

const ALERTS = [
	{ key: "live", label: "Say when the stream goes live" },
	{ key: "brb", label: "Say when the signal drops" },
	{ key: "back", label: "Say when the signal comes back" },
	{ key: "offline", label: "Say when the stream ends" },
] as const;

type Settings = {
	enabled: boolean;
	commandsEnabled: boolean;
	prefix: string;
	senderMode: "visp" | "self";
	targets: Record<ChatProvider, boolean>;
	alerts: Record<(typeof ALERTS)[number]["key"], boolean>;
	messages: Record<(typeof ALERTS)[number]["key"], string | null>;
	moderator: {
		enabled: boolean;
		rules: string;
		maxTimeoutSeconds: number;
	} & Record<(typeof MODERATOR_EVENTS)[number]["key"], boolean>;
};

export function ChatBotCard() {
	const t = useT();
	const fi = useLocale() === "fi";
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const bot = useQuery(trpc.chat.bot.get.queryOptions());
	const connections = useQuery(trpc.chat.connections.list.queryOptions());
	const plan = usePlan();
	const [draft, setDraft] = useState<Settings | null>(null);
	const [command, setCommand] = useState({ name: "", response: "" });

	const update = useMutation(
		trpc.chat.bot.update.mutationOptions({
			onSuccess: async () => {
				setDraft(null);
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const addCommand = useMutation(
		trpc.chat.bot.upsertCommand.mutationOptions({
			onSuccess: async () => {
				setCommand({ name: "", response: "" });
				await queryClient.invalidateQueries();
				toast.success(t("Command saved"));
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const removeCommand = useMutation(
		trpc.chat.bot.deleteCommand.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries();
			},
			onError: (error) => toast.error(error.message),
		}),
	);
	const test = useMutation(
		trpc.chat.bot.test.mutationOptions({
			onSuccess: ({ provider }) =>
				toast.success(`${providerLabel(provider)}: ${t("test message sent")}`),
			onError: (error) => toast.error(error.message),
		}),
	);

	if (!bot.data) return null;
	const settings: Settings = draft ?? bot.data.settings;
	const save = (over: Partial<Settings>) => {
		const next = { ...settings, ...over };
		setDraft(next);
		update.mutate(next);
	};

	const canPost = new Set<string>(bot.data.canPost);
	const linked = (connections.data ?? []).filter((entry) => entry.linked);
	const needsConsent = linked.filter(
		(entry) => settings.targets[entry.provider] && !canPost.has(entry.provider),
	);

	const allowPosting = async (provider: ChatProvider) => {
		const granted =
			connections.data?.find((entry) => entry.provider === provider)
				?.grantedScopes ?? [];
		const adding =
			provider === "twitch" && settings.senderMode === "visp"
				? PROVIDER_SCOPES.twitch.botChannel
				: PROVIDER_SCOPES[provider].chatWrite;
		const result = await linkProvider({
			provider,
			granted,
			adding,
			fi,
		});
		if (result.error) {
			toast.error(result.error.message ?? t("Could not authorize posting"));
		}
	};

	const moderator = bot.data.moderator;
	const moderatorEntitled = Boolean(
		plan.data?.features.find((row) => row.feature === "ai_moderator")?.entitled,
	);
	const twitchGranted =
		connections.data?.find((entry) => entry.provider === "twitch")
			?.grantedScopes ?? [];
	const saveModerator = (over: Partial<Settings["moderator"]>) =>
		save({ moderator: { ...settings.moderator, ...over } });
	const moderatorActive =
		moderatorEntitled &&
		settings.moderator.enabled &&
		moderator.configured &&
		moderator.botScopesGranted &&
		moderator.chatConnected &&
		moderator.canPost &&
		moderator.botIsModerator;
	const moderatorStatus = !moderator.configured
		? t("Not available on this server.")
		: !moderator.botScopesGranted
			? t("The shared VISP bot is not set up for moderation yet.")
			: !moderator.chatConnected
				? t("Connect Twitch chat in Connections first.")
				: !moderator.canPost
					? null
					: !moderator.botIsModerator
						? `${t("Type")} /mod ${moderator.botLogin} ${t("in your Twitch chat so the bot can act.")}`
						: `${t("Moderating as")} ${moderator.botLogin}.`;
	/** Operator only: the bot account grants its own scopes from this card. */
	const authorizeBotScopes = async () => {
		const result = await linkProvider({
			provider: "twitch",
			granted: twitchGranted,
			adding: PROVIDER_SCOPES.twitch.sharedBot,
			fi,
		});
		if (result.error) {
			toast.error(result.error.message ?? t("Could not authorize posting"));
		}
	};

	return (
		<Card id="dashboard-chat-bot">
			<VStack gap={4}>
				<VStack gap={1}>
					<HStack gap={2} vAlign="center" wrap="wrap">
						<Heading level={2}>{t("Chat bot")}</Heading>
						<DocsHelpLink
							href={docs.chatBot}
							label={t("See what the chat bot posts and answers")}
						/>
						{settings.enabled ? (
							<Badge label={t("On")} variant="success" />
						) : null}
					</HStack>
					<Text color="secondary" type="supporting">
						{t(
							"Posts to your chat when the stream goes live, drops, or comes back, and answers commands like !bitrate.",
						)}
					</Text>
				</VStack>

				<VStack gap={2}>
					<HStack gap={2} vAlign="center" wrap="wrap">
						<Text type="label">{t("AI moderator")}</Text>
						<Badge label={t("Plus")} variant="info" />
						{moderatorActive ? (
							<Badge label={t("On")} variant="success" />
						) : null}
					</HStack>
					<Text color="secondary" type="supporting">
						{t(
							"Watches your Twitch chat as the VISP bot: removes rule-breaking messages, times out repeat offenders, answers when mentioned, and clips on request.",
						)}
					</Text>
					{moderatorEntitled ? (
						<>
							<Switch
								label={t("Moderate my Twitch chat")}
								labelSpacing="spread"
								value={settings.moderator.enabled}
								onChange={(value) => saveModerator({ enabled: value })}
							/>
							{settings.moderator.enabled ? (
								<>
									{moderatorStatus ? (
										<Text color="secondary" type="supporting">
											{moderatorStatus}
										</Text>
									) : null}
									{moderator.chatConnected && !moderator.canPost ? (
										<HStack
											gap={2}
											hAlign="between"
											vAlign="center"
											wrap="wrap"
										>
											<Text color="secondary" type="supporting">
												{`Twitch: ${t("posting is not authorized yet")}`}
											</Text>
											<Button
												icon={
													<Icon
														color="inherit"
														icon={MessageCircleIcon}
														size="sm"
													/>
												}
												label={t("Authorize posting")}
												onClick={() => void allowPosting("twitch")}
											/>
										</HStack>
									) : null}
									<TextArea
										description={t(
											"What to remove, what to allow, and how to sound. Twitch rules always apply.",
										)}
										label={t("House rules")}
										maxLength={2000}
										placeholder={t(
											"No politics, no backseating, swearing is fine. Keep replies playful.",
										)}
										rows={3}
										value={settings.moderator.rules}
										onBlur={() => update.mutate(settings)}
										onChange={(value) =>
											setDraft({
												...settings,
												moderator: { ...settings.moderator, rules: value },
											})
										}
									/>
									<TextInput
										label={t("Longest timeout (seconds)")}
										value={String(settings.moderator.maxTimeoutSeconds)}
										onBlur={() =>
											update.mutate({
												...settings,
												moderator: {
													...settings.moderator,
													maxTimeoutSeconds: Math.min(
														Math.max(settings.moderator.maxTimeoutSeconds, 1),
														MAX_TIMEOUT_SECONDS,
													),
												},
											})
										}
										onChange={(value) =>
											setDraft({
												...settings,
												moderator: {
													...settings.moderator,
													maxTimeoutSeconds: Number.parseInt(value, 10) || 0,
												},
											})
										}
									/>
									{MODERATOR_EVENTS.map((event) => (
										<Switch
											key={event.key}
											label={t(event.label)}
											labelSpacing="spread"
											value={settings.moderator[event.key]}
											onChange={(value) =>
												saveModerator({ [event.key]: value })
											}
										/>
									))}
								</>
							) : null}
						</>
					) : (
						<VStack gap={1}>
							<HStack>
								<UpgradeButton />
							</HStack>
							<AffiliateNote />
						</VStack>
					)}
					{moderator.isSharedBotAccount && !moderator.botScopesGranted ? (
						<HStack>
							<Button
								icon={<Icon color="inherit" icon={ShieldCheckIcon} size="sm" />}
								label={t("Set up this account as the shared VISP bot")}
								onClick={() => void authorizeBotScopes()}
							/>
						</HStack>
					) : null}
				</VStack>

				<Switch
					label={t("Let VISP post in my chat")}
					labelSpacing="spread"
					value={settings.enabled}
					onChange={(value) => save({ enabled: value })}
				/>

				{bot.data.canSelectSender ? (
					<Selector
						label={t("Twitch sender")}
						options={[
							{ value: "visp", label: t("VISP bot") },
							{ value: "self", label: t("My Twitch account") },
						]}
						value={settings.senderMode}
						onChange={(value) => {
							if (value === "visp" || value === "self") {
								save({ senderMode: value });
							}
						}}
					/>
				) : null}

				{settings.enabled ? (
					<>
						<VStack gap={2}>
							<Text type="label">{t("Post on")}</Text>
							{PROVIDERS.map((provider) => (
								<HStack
									gap={2}
									hAlign="between"
									key={provider}
									vAlign="center"
									wrap="wrap"
								>
									<Switch
										label={providerLabel(provider)}
										labelSpacing="spread"
										value={settings.targets[provider]}
										onChange={(value) =>
											save({
												targets: { ...settings.targets, [provider]: value },
											})
										}
									/>
									{settings.targets[provider] && canPost.has(provider) ? (
										<Button
											icon={<Icon color="inherit" icon={SendIcon} size="sm" />}
											isLoading={test.isPending}
											label={t("Send test")}
											variant="ghost"
											onClick={() => test.mutate({ provider })}
										/>
									) : null}
								</HStack>
							))}
						</VStack>

						{needsConsent.map((entry) => (
							<HStack
								gap={2}
								hAlign="between"
								key={entry.provider}
								vAlign="center"
								wrap="wrap"
							>
								<Text color="secondary" type="supporting">
									{`${providerLabel(entry.provider)}: ${t("posting is not authorized yet")}`}
								</Text>
								<Button
									icon={
										<Icon color="inherit" icon={MessageCircleIcon} size="sm" />
									}
									label={t("Authorize posting")}
									onClick={() => void allowPosting(entry.provider)}
								/>
							</HStack>
						))}

						<VStack gap={2}>
							{ALERTS.map((alert) => (
								<Switch
									key={alert.key}
									label={t(alert.label)}
									labelSpacing="spread"
									value={settings.alerts[alert.key]}
									onChange={(value) =>
										save({
											alerts: { ...settings.alerts, [alert.key]: value },
										})
									}
								/>
							))}
						</VStack>

						<Switch
							label={t("Answer chat commands")}
							labelSpacing="spread"
							value={settings.commandsEnabled}
							onChange={(value) => save({ commandsEnabled: value })}
						/>

						<Collapsible
							defaultIsOpen={false}
							trigger={<Text type="label">{t("Wording and commands")}</Text>}
						>
							<VStack gap={3} paddingBlock={2}>
								{ALERTS.map((alert) => (
									<TextInput
										key={alert.key}
										label={t(alert.label)}
										placeholder={bot.data.defaultMessages[alert.key]}
										value={settings.messages[alert.key] ?? ""}
										onBlur={() =>
											update.mutate({
												...settings,
												messages: {
													...settings.messages,
													[alert.key]:
														settings.messages[alert.key]?.trim() || null,
												},
											})
										}
										onChange={(value) =>
											setDraft({
												...settings,
												messages: {
													...settings.messages,
													[alert.key]: value,
												},
											})
										}
									/>
								))}
								<Text color="secondary" type="supporting">
									{t(
										"Placeholders: {device}, {uptime}, {downtime}. Leave a field empty to use the default wording.",
									)}
								</Text>

								<Text type="label">{t("Custom commands")}</Text>
								{bot.data.commands.map((entry) => (
									<HStack
										gap={2}
										hAlign="between"
										key={entry.name}
										vAlign="center"
										wrap="wrap"
									>
										<Text type="supporting">
											{`${settings.prefix}${entry.name} → ${entry.response}`}
										</Text>
										<Button
											icon={
												<Icon color="inherit" icon={Trash2Icon} size="sm" />
											}
											isLoading={removeCommand.isPending}
											label={t("Remove")}
											variant="ghost"
											onClick={() => removeCommand.mutate({ name: entry.name })}
										/>
									</HStack>
								))}
								<HStack gap={2} vAlign="end" wrap="wrap">
									<TextInput
										label={t("Command")}
										placeholder="discord"
										value={command.name}
										onChange={(value) =>
											setCommand((previous) => ({ ...previous, name: value }))
										}
									/>
									<TextInput
										label={t("Reply")}
										placeholder={t("Join at example.com/discord")}
										value={command.response}
										onChange={(value) =>
											setCommand((previous) => ({
												...previous,
												response: value,
											}))
										}
									/>
									<Button
										isDisabled={
											!command.name.trim() || !command.response.trim()
										}
										isLoading={addCommand.isPending}
										label={t("Add command")}
										onClick={() =>
											addCommand.mutate({
												name: command.name.trim(),
												response: command.response.trim(),
												modOnly: false,
												cooldownSeconds: 10,
											})
										}
									/>
								</HStack>
								<Text color="secondary" type="supporting">
									{t(
										"Built in: !bitrate, !uptime, !viewers, !commands, and !title for you and your mods.",
									)}
								</Text>
							</VStack>
						</Collapsible>
					</>
				) : null}
			</VStack>
		</Card>
	);
}
