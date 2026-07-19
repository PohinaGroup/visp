import * as UI from "@expo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../lib/backend";
import {
	type CategorySuggestion,
	loadStreamInfoDraft,
	mergeCategorySuggestions,
	saveStreamInfoDraft,
	summarizeUpdateResults,
} from "../lib/stream-info";

const SUBTLE_TEXT = { color: "#8a919c", fontSize: 13 } as const;

type ChatConnections = Awaited<
	ReturnType<typeof apiClient.chat.connections.list.query>
>;

function suggestionBadge(suggestion: CategorySuggestion) {
	return [
		suggestion.twitchCategoryId && "Twitch",
		suggestion.kickCategoryId && "Kick",
	]
		.filter(Boolean)
		.join(" · ");
}

export function StreamInfoSheet({
	authorizing,
	connections,
	isPresented,
	onAuthorize,
	onDismiss,
	showToast,
	userId,
}: {
	authorizing: boolean;
	connections: ChatConnections;
	isPresented: boolean;
	onAuthorize: (provider: "twitch" | "kick") => void;
	onDismiss: () => void;
	showToast: (text: string, spinning?: boolean) => void;
	userId: string;
}) {
	const [ready, setReady] = useState(false);
	const [title, setTitle] = useState("");
	const [query, setQuery] = useState("");
	const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
	const [selected, setSelected] = useState<CategorySuggestion>();
	const [updating, setUpdating] = useState(false);
	const searchId = useRef(0);

	useEffect(() => {
		setReady(false);
		setTitle("");
		setSelected(undefined);
		loadStreamInfoDraft(userId)
			.then((draft) => {
				if (!draft) return;
				setTitle(draft.title);
				if (draft.twitchCategoryId || draft.kickCategoryId) {
					setSelected({
						name: draft.categoryName,
						twitchCategoryId: draft.twitchCategoryId,
						kickCategoryId: draft.kickCategoryId,
					});
				}
			})
			.catch(() => undefined)
			.finally(() => setReady(true));
	}, [userId]);

	useEffect(() => {
		const trimmed = query.trim();
		const request = ++searchId.current;
		if (trimmed.length < 2) {
			setSuggestions([]);
			return;
		}
		const timer = setTimeout(() => {
			apiClient.channel.searchCategories
				.query({ query: trimmed })
				.then(({ twitch, kick }) => {
					if (searchId.current === request)
						setSuggestions(mergeCategorySuggestions(twitch, kick));
				})
				.catch(() => undefined);
		}, 300);
		return () => clearTimeout(timer);
	}, [query]);

	const update = useCallback(async () => {
		const trimmed = title.trim();
		if (!trimmed && !selected) return;
		setUpdating(true);
		try {
			const results = await apiClient.channel.update.mutate({
				...(trimmed && { title: trimmed }),
				...(selected?.twitchCategoryId && {
					twitchCategoryId: selected.twitchCategoryId,
				}),
				...(selected?.kickCategoryId && {
					kickCategoryId: selected.kickCategoryId,
				}),
			});
			void saveStreamInfoDraft(userId, {
				title: trimmed,
				categoryName: selected?.name ?? "",
				twitchCategoryId: selected?.twitchCategoryId,
				kickCategoryId: selected?.kickCategoryId,
			}).catch(() => undefined);
			showToast(summarizeUpdateResults(results));
		} catch (error) {
			showToast(
				error instanceof Error
					? error.message
					: "Stream info could not be updated",
			);
		} finally {
			setUpdating(false);
		}
	}, [selected, showToast, title, userId]);

	const needingConsent = connections.filter(
		(connection) => connection.linked && !connection.canManageChannel,
	);
	const canUpdate = connections.some(
		(connection) => connection.linked && connection.canManageChannel,
	);

	return (
		<UI.BottomSheet
			isPresented={isPresented}
			onDismiss={onDismiss}
			snapPoints={["half", "full"]}
		>
			<UI.FieldGroup>
				<UI.FieldGroup.Section title="Stream info">
					{ready ? (
						<UI.TextInput
							defaultValue={title}
							maxLength={140}
							onChangeText={setTitle}
							placeholder="Stream title"
						/>
					) : null}
					<UI.TextInput
						key={selected ? `search-${selected.name}` : "search"}
						onChangeText={setQuery}
						placeholder="Search categories"
					/>
					{selected ? (
						<UI.Row alignment="center" spacing={12}>
							<UI.Column spacing={2}>
								<UI.Text>{selected.name}</UI.Text>
								<UI.Text textStyle={SUBTLE_TEXT}>
									{suggestionBadge(selected)}
								</UI.Text>
							</UI.Column>
							<UI.Spacer flexible />
							<UI.Button
								label="Clear"
								onPress={() => setSelected(undefined)}
								variant="text"
							/>
						</UI.Row>
					) : null}
					{suggestions.map((suggestion) => (
						<UI.Row
							alignment="center"
							key={suggestion.name}
							onPress={() => {
								setSelected(suggestion);
								setSuggestions([]);
								setQuery("");
							}}
							spacing={12}
						>
							<UI.Text>{suggestion.name}</UI.Text>
							<UI.Spacer flexible />
							<UI.Text textStyle={SUBTLE_TEXT}>
								{suggestionBadge(suggestion)}
							</UI.Text>
						</UI.Row>
					))}
				</UI.FieldGroup.Section>
				{needingConsent.length > 0 ? (
					<UI.FieldGroup.Section>
						{needingConsent.map((connection) => (
							<UI.Row alignment="center" key={connection.provider} spacing={12}>
								<UI.Text>
									{`Allow VISP to edit your ${connection.provider === "twitch" ? "Twitch" : "Kick"} stream info`}
								</UI.Text>
								<UI.Spacer flexible />
								<UI.Button
									disabled={authorizing}
									label="Authorize"
									onPress={() => onAuthorize(connection.provider)}
									variant="outlined"
								/>
							</UI.Row>
						))}
					</UI.FieldGroup.Section>
				) : null}
				<UI.FieldGroup.Section>
					<UI.Button
						disabled={updating || !canUpdate || (!title.trim() && !selected)}
						label={updating ? "Updating…" : "Update stream info"}
						onPress={() => void update()}
						variant="text"
					/>
					{canUpdate ? null : (
						<UI.FieldGroup.SectionFooter>
							<UI.Text textStyle={SUBTLE_TEXT}>
								Authorize Twitch or Kick above to update stream info.
							</UI.Text>
						</UI.FieldGroup.SectionFooter>
					)}
				</UI.FieldGroup.Section>
			</UI.FieldGroup>
		</UI.BottomSheet>
	);
}
