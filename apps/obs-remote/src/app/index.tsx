import { useRef, useState } from "react";
import {
	ActivityIndicator,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiClient, authCallbackURL, authClient } from "../lib/backend";
import { useObsLive } from "../lib/use-obs-live";
import {
	type ObsTile,
	type TileAction,
	type TileDraft,
	useObsTiles,
} from "../lib/use-obs-tiles";
import { DraggableDeck } from "./deck-grid";

const TILE_COLORS = ["#ff3757", "#53fc18", "#35a7ff", "#ffb43a", "#b06bff"];

type ObsToggle = "recording" | "virtualCam" | "replayBuffer" | "recordPaused";

// One row per tile action: editor title, corner tag, on/off state words, and
// (for the four Phase-1 toggles) the server toggle name it drives.
const ACTION_META: Record<
	TileAction,
	{ title: string; tag: string; on: string; off: string; toggle?: ObsToggle }
> = {
	scene: { title: "Switch scene", tag: "SCN", on: "PROGRAM", off: "STANDBY" },
	stream: { title: "Toggle stream", tag: "AIR", on: "LIVE", off: "READY" },
	recording: {
		title: "Toggle recording",
		tag: "REC",
		on: "REC",
		off: "IDLE",
		toggle: "recording",
	},
	virtualcam: {
		title: "Virtual camera",
		tag: "VCAM",
		on: "ON",
		off: "OFF",
		toggle: "virtualCam",
	},
	replaybuffer: {
		title: "Replay buffer",
		tag: "BUF",
		on: "ON",
		off: "OFF",
		toggle: "replayBuffer",
	},
	recordpause: {
		title: "Pause recording",
		tag: "PAUSE",
		on: "PAUSED",
		off: "LIVE",
		toggle: "recordPaused",
	},
};

const ACTION_ORDER = Object.keys(ACTION_META) as TileAction[];

type Provider = "twitch" | "kick";

function SignIn() {
	const [error, setError] = useState<string>();
	const [signingIn, setSigningIn] = useState<Provider>();
	const signInLock = useRef(false);

	async function signIn(provider: Provider) {
		if (signInLock.current) return;
		signInLock.current = true;
		setSigningIn(provider);
		setError(undefined);
		const callbackURL = authCallbackURL();
		try {
			const result =
				provider === "twitch"
					? await authClient.signIn.social({
							callbackURL,
							provider,
						})
					: await authClient.signIn.oauth2({
							callbackURL,
							providerId: provider,
						});
			if (result.error) {
				setError(result.error.message ?? `${provider} sign-in failed`);
				return;
			}
			const hasCookie = Boolean(authClient.getCookie());
			const session = await authClient.getSession();
			if (!hasCookie && !session.data?.user) {
				setError(`${provider} sign-in did not establish a session. Try again.`);
			}
		} catch (error) {
			setError(
				error instanceof Error ? error.message : `${provider} sign-in failed`,
			);
		} finally {
			signInLock.current = false;
			setSigningIn(undefined);
		}
	}

	return (
		<View style={styles.signInBackground}>
			<View style={styles.signalGlow} />
			<SafeAreaView style={styles.signInSafeArea}>
				<ScrollView contentContainerStyle={styles.signInScroll}>
					<View style={styles.signInPanel}>
						<View style={styles.brandRow}>
							<View style={styles.brandMark}>
								<Text style={styles.brandMarkText}>V</Text>
							</View>
							<View>
								<Text style={styles.eyebrow}>VISP CONTROL SURFACE</Text>
								<Text style={styles.brandName}>OBS REMOTE</Text>
							</View>
						</View>
						<Text style={styles.signInTitle}>Your stream desk, anywhere.</Text>
						<Text style={styles.signInCopy}>
							Sign in with the streaming account already connected to VISP. Your
							paired OBS installation and scenes will appear automatically.
						</Text>
						{error ? (
							<Text accessibilityLiveRegion="polite" style={styles.errorText}>
								{error}
							</Text>
						) : null}
						<Pressable
							accessibilityRole="button"
							disabled={Boolean(signingIn)}
							onPress={() => void signIn("twitch")}
							style={({ pressed }) => [
								styles.signInButton,
								styles.twitchButton,
								Boolean(signingIn) && styles.disabled,
								pressed && styles.pressed,
							]}
						>
							<Text style={styles.signInButtonText}>
								{signingIn === "twitch"
									? "OPENING TWITCH..."
									: "CONTINUE WITH TWITCH"}
							</Text>
						</Pressable>
						<Pressable
							accessibilityRole="button"
							disabled={Boolean(signingIn)}
							onPress={() => void signIn("kick")}
							style={({ pressed }) => [
								styles.signInButton,
								styles.kickButton,
								Boolean(signingIn) && styles.disabled,
								pressed && styles.pressed,
							]}
						>
							<Text style={[styles.signInButtonText, styles.kickButtonText]}>
								{signingIn === "kick"
									? "OPENING KICK..."
									: "CONTINUE WITH KICK"}
							</Text>
						</Pressable>
						<Text style={styles.securityNote}>
							The app receives a normal VISP session. Your OBS machine
							credential stays inside the plugin.
						</Text>
					</View>
				</ScrollView>
			</SafeAreaView>
		</View>
	);
}

function StatusDot({ connected }: { connected: boolean }) {
	return (
		<View style={[styles.statusDot, connected && styles.statusDotConnected]} />
	);
}

export default function Index() {
	const { width } = useWindowDimensions();
	const { data: session, isPending: sessionPending } = authClient.useSession();
	const userId = session?.user.id;
	const live = useObsLive(userId);
	const tiles = useObsTiles(userId);
	const [busy, setBusy] = useState<"stream" | string>();
	const [commandError, setCommandError] = useState<string>();
	const [signingOut, setSigningOut] = useState(false);
	const [editMode, setEditMode] = useState(false);
	const [editor, setEditor] = useState<ObsTile | "new" | null>(null);
	const status = live.status;
	const controlsDisabled = Boolean(
		busy || !status?.connected || status.pending || live.liveState !== "open",
	);
	const columns = width >= 1000 ? 6 : width >= 680 ? 4 : 3;
	const contentWidth = Math.min(width - 24, 1180);
	const keyGap = 10;
	const keyWidth = (contentWidth - keyGap * (columns - 1)) / columns;

	async function setStreaming() {
		if (!status || controlsDisabled || !userId) return;
		const expectedUserId = userId;
		setBusy("stream");
		setCommandError(undefined);
		try {
			live.acceptStatus(
				await apiClient.obs.setStreaming.mutate({
					streaming: !status.streaming,
				}),
				expectedUserId,
			);
		} catch (error) {
			setCommandError(
				error instanceof Error ? error.message : "OBS command failed",
			);
		} finally {
			setBusy(undefined);
		}
	}

	async function setScene(scene: string) {
		if (controlsDisabled || scene === status?.currentScene || !userId) return;
		const expectedUserId = userId;
		setBusy(scene);
		setCommandError(undefined);
		try {
			live.acceptStatus(
				await apiClient.obs.setScene.mutate({ scene }),
				expectedUserId,
			);
		} catch (error) {
			setCommandError(
				error instanceof Error ? error.message : "OBS scene switch failed",
			);
		} finally {
			setBusy(undefined);
		}
	}

	async function setToggle(action: TileAction, toggle: ObsToggle, on: boolean) {
		if (controlsDisabled || !userId) return;
		const expectedUserId = userId;
		setBusy(action);
		setCommandError(undefined);
		try {
			live.acceptStatus(
				await apiClient.obs.setToggle.mutate({ toggle, on }),
				expectedUserId,
			);
		} catch (error) {
			setCommandError(
				error instanceof Error ? error.message : "OBS command failed",
			);
		} finally {
			setBusy(undefined);
		}
	}

	function runTile(tile: ObsTile) {
		if (tile.action === "stream") return void setStreaming();
		if (tile.action === "scene")
			return void (tile.sceneName && setScene(tile.sceneName));
		const toggle = ACTION_META[tile.action].toggle;
		if (toggle) void setToggle(tile.action, toggle, !tileActive(tile));
	}

	async function saveTile(draft: TileDraft) {
		setCommandError(undefined);
		try {
			if (editor === "new") await tiles.create(draft);
			else if (editor) await tiles.update(editor.id, draft);
			setEditor(null);
		} catch (error) {
			setCommandError(
				error instanceof Error ? error.message : "Could not save tile",
			);
		}
	}

	async function deleteTile() {
		if (!editor || editor === "new") return;
		setCommandError(undefined);
		try {
			await tiles.remove(editor.id);
			setEditor(null);
		} catch (error) {
			setCommandError(
				error instanceof Error ? error.message : "Could not delete tile",
			);
		}
	}

	async function signOut() {
		setSigningOut(true);
		setCommandError(undefined);
		try {
			const result = await authClient.signOut();
			if (result.error) {
				setCommandError(result.error.message ?? "Sign out failed");
			}
		} catch (error) {
			setCommandError(
				error instanceof Error ? error.message : "Sign out failed",
			);
		} finally {
			setSigningOut(false);
		}
	}

	if (sessionPending) {
		return (
			<View style={styles.loading}>
				<ActivityIndicator color="#ff3757" />
				<Text style={styles.loadingText}>RESTORING CONTROL SESSION</Text>
			</View>
		);
	}
	if (!session) return <SignIn />;

	const connected = Boolean(status?.connected && live.liveState === "open");
	const connectionLabel = !status
		? live.liveState === "offline"
			? "NETWORK OFFLINE"
			: live.liveState === "reconnecting"
				? "RECONNECTING"
				: "CONNECTING"
		: !status.configured
			? "NOT PAIRED"
			: connected
				? "OBS ONLINE"
				: "OBS OFFLINE";
	const notice = commandError ?? live.error ?? tiles.error;
	const canEdit = !(status && !status.configured);

	const tileActive = (tile: ObsTile): boolean => {
		switch (tile.action) {
			case "stream":
				return Boolean(status?.streaming);
			case "scene":
				return status?.currentScene === tile.sceneName;
			case "recording":
				return Boolean(status?.recording);
			case "virtualcam":
				return Boolean(status?.virtualCam);
			case "replaybuffer":
				return Boolean(status?.replayBuffer);
			case "recordpause":
				return Boolean(status?.recordPaused);
		}
	};

	// Busy is keyed by scene name for scene tiles, otherwise by the action.
	const busyKey = (tile: ObsTile) =>
		tile.action === "scene" ? (tile.sceneName ?? "") : tile.action;

	const renderTileFace = (tile: ObsTile, dragging: boolean) => {
		const active = tileActive(tile);
		const accent = tile.color ?? RED;
		const meta = ACTION_META[tile.action];
		const state =
			busy === busyKey(tile) ? "SENDING" : active ? meta.on : meta.off;
		return (
			<View
				style={[
					styles.key,
					active && { borderColor: accent },
					dragging && styles.keyDragging,
				]}
			>
				<View style={styles.keyTop}>
					<Text style={styles.keyIndex}>{meta.tag}</Text>
					<View
						style={[
							styles.led,
							active && {
								backgroundColor: accent,
								shadowColor: accent,
								shadowOpacity: 0.9,
								shadowRadius: 6,
							},
						]}
					/>
				</View>
				<Text numberOfLines={2} style={styles.keyLabel}>
					{tile.label}
				</Text>
				<Text style={styles.keyState}>{state}</Text>
			</View>
		);
	};

	return (
		<View style={styles.appBackground}>
			<SafeAreaView style={styles.safeArea}>
				<ScrollView
					contentContainerStyle={[
						styles.scrollContent,
						{ width: contentWidth },
					]}
					showsVerticalScrollIndicator={false}
				>
					<View style={styles.topBar}>
						<View>
							<View style={styles.connectionRow}>
								<StatusDot connected={connected} />
								<Text style={styles.connectionText}>{connectionLabel}</Text>
							</View>
						</View>
						<View style={styles.accountBlock}>
							<Text numberOfLines={1} style={styles.accountName}>
								{session.user.name}
							</Text>
							<View style={styles.topActions}>
								{canEdit ? (
									<Pressable
										accessibilityRole="button"
										hitSlop={8}
										onPress={() => {
											setEditMode((on) => !on);
											setEditor(null);
										}}
										style={({ pressed }) => [
											styles.editToggle,
											editMode && styles.editToggleOn,
											pressed && styles.pressed,
										]}
									>
										<Text
											style={[
												styles.editToggleText,
												editMode && styles.editToggleTextOn,
											]}
										>
											{editMode ? "DONE" : "EDIT"}
										</Text>
									</Pressable>
								) : null}
								<Pressable
									accessibilityRole="button"
									disabled={signingOut}
									hitSlop={8}
									onPress={() => void signOut()}
									style={({ pressed }) => [
										styles.signOut,
										signingOut && styles.disabled,
										pressed && styles.pressed,
									]}
								>
									<Text style={styles.signOutText}>
										{signingOut ? "SIGNING OUT" : "SIGN OUT"}
									</Text>
								</Pressable>
							</View>
						</View>
					</View>

					{notice ? (
						<Pressable
							accessibilityHint="Dismisses this message"
							accessibilityLabel="Dismiss error message"
							accessibilityLiveRegion="polite"
							accessibilityRole="button"
							onPress={() => {
								setCommandError(undefined);
								live.clearError();
							}}
							style={styles.notice}
						>
							<Text style={styles.noticeText}>{notice}</Text>
							<Text style={styles.noticeDismiss}>DISMISS</Text>
						</Pressable>
					) : null}

					{status && !status.configured ? (
						<View style={styles.emptyState}>
							<Text style={styles.emptyIndex}>01</Text>
							<Text style={styles.emptyTitle}>PAIR OBS TO THIS ACCOUNT</Text>
							<Text style={styles.emptyCopy}>
								In OBS, open Tools → VISP Remote Control, choose Sign in with
								browser, and approve the code using this VISP account.
							</Text>
						</View>
					) : editMode ? (
						<View style={styles.deckEdit}>
							<DraggableDeck
								cellHeight={keyWidth}
								cellWidth={keyWidth}
								columns={columns}
								gap={keyGap}
								onEdit={(tile) => setEditor(tile)}
								onReorder={(ids) => void tiles.reorder(ids)}
								renderTile={renderTileFace}
								tiles={tiles.tiles}
							/>
							<Pressable
								accessibilityLabel="Add tile"
								accessibilityRole="button"
								onPress={() => setEditor("new")}
								style={({ pressed }) => [
									styles.addKey,
									{
										width: keyWidth,
										marginTop: tiles.tiles.length ? keyGap : 0,
									},
									pressed && styles.pressed,
								]}
							>
								<Text style={styles.addKeyPlus}>＋</Text>
								<Text style={styles.addKeyLabel}>ADD TILE</Text>
							</Pressable>
							<Text style={styles.deckHint}>
								Drag to reorder · tap a tile to edit
							</Text>
						</View>
					) : (
						<View style={[styles.deck, { gap: keyGap }]}>
							{tiles.tiles.map((tile) => {
								const active = tileActive(tile);
								const disabled =
									tile.action === "scene"
										? controlsDisabled || active
										: controlsDisabled;
								return (
									<Pressable
										accessibilityLabel={tile.label}
										accessibilityRole="button"
										accessibilityState={{ disabled, selected: active }}
										disabled={disabled}
										key={tile.id}
										onPress={() => runTile(tile)}
										style={({ pressed }) => [
											styles.tileWrap,
											{ width: keyWidth },
											disabled && !active && styles.controlDisabled,
											pressed && styles.pressed,
										]}
									>
										{renderTileFace(tile, false)}
									</Pressable>
								);
							})}
							{!tiles.tiles.length ? (
								<View style={styles.noScenes}>
									<Text style={styles.noScenesText}>
										{tiles.loading
											? "LOADING DECK"
											: "NO TILES YET — TAP EDIT TO BUILD YOUR DECK"}
									</Text>
								</View>
							) : null}
						</View>
					)}
					<Text accessibilityLiveRegion="polite" style={styles.footerStatus}>
						{status?.pending
							? `COMMAND ${status.commandVersion} AWAITING OBS`
							: connected
								? `REAL-TIME LINK · ${status?.currentScene ?? "NO PROGRAM SCENE"}`
								: "REAL-TIME LINK DISCONNECTED"}
					</Text>
				</ScrollView>
			</SafeAreaView>
			{editor ? (
				<TileEditor
					editing={editor === "new" ? null : editor}
					onCancel={() => setEditor(null)}
					onDelete={editor === "new" ? undefined : () => void deleteTile()}
					onSave={(draft) => void saveTile(draft)}
					scenes={status?.scenes ?? []}
				/>
			) : null}
		</View>
	);
}

function TileEditor({
	editing,
	scenes,
	onSave,
	onDelete,
	onCancel,
}: {
	editing: ObsTile | null;
	scenes: string[];
	onSave: (draft: TileDraft) => void;
	onDelete?: () => void;
	onCancel: () => void;
}) {
	const [action, setAction] = useState<TileDraft["action"]>(
		editing?.action ?? "scene",
	);
	const [sceneName, setSceneName] = useState<string | null>(
		editing?.sceneName ?? scenes[0] ?? null,
	);
	const [label, setLabel] = useState(editing?.label ?? "");
	const [color, setColor] = useState<string | null>(editing?.color ?? null);

	const trimmed = label.trim();
	const valid =
		trimmed.length > 0 && (action === "stream" || Boolean(sceneName));

	return (
		<Modal animationType="slide" onRequestClose={onCancel} transparent>
			<View style={styles.modalBackdrop}>
				<View style={styles.modalCard}>
					<Text style={styles.modalTitle}>
						{editing ? "EDIT TILE" : "NEW TILE"}
					</Text>

					<Text style={styles.fieldLabel}>LABEL</Text>
					<TextInput
						maxLength={64}
						onChangeText={setLabel}
						placeholder="Tile label"
						placeholderTextColor="#5b626e"
						style={styles.input}
						value={label}
					/>

					<Text style={styles.fieldLabel}>ACTION</Text>
					{ACTION_ORDER.map((option) => (
						<Pressable
							key={option}
							onPress={() => setAction(option)}
							style={[styles.sceneRow, action === option && styles.sceneRowOn]}
						>
							<Text numberOfLines={1} style={styles.sceneRowText}>
								{ACTION_META[option].title}
							</Text>
							{action === option ? (
								<Text style={styles.sceneRowCheck}>●</Text>
							) : null}
						</Pressable>
					))}

					{action === "scene" ? (
						<>
							<Text style={styles.fieldLabel}>SCENE</Text>
							{scenes.length ? (
								<ScrollView style={styles.sceneList}>
									{scenes.map((scene) => (
										<Pressable
											key={scene}
											onPress={() => setSceneName(scene)}
											style={[
												styles.sceneRow,
												sceneName === scene && styles.sceneRowOn,
											]}
										>
											<Text numberOfLines={1} style={styles.sceneRowText}>
												{scene}
											</Text>
											{sceneName === scene ? (
												<Text style={styles.sceneRowCheck}>●</Text>
											) : null}
										</Pressable>
									))}
								</ScrollView>
							) : (
								<Text style={styles.modalNote}>
									Connect OBS to choose a scene. You can still save a stream
									tile.
								</Text>
							)}
						</>
					) : null}

					<Text style={styles.fieldLabel}>COLOR</Text>
					<View style={styles.swatchRow}>
						<Pressable
							onPress={() => setColor(null)}
							style={[
								styles.swatch,
								styles.swatchNone,
								color === null && styles.swatchOn,
							]}
						/>
						{TILE_COLORS.map((preset) => (
							<Pressable
								key={preset}
								onPress={() => setColor(preset)}
								style={[
									styles.swatch,
									{ backgroundColor: preset },
									color === preset && styles.swatchOn,
								]}
							/>
						))}
					</View>

					<View style={styles.modalActions}>
						{onDelete ? (
							<Pressable
								hitSlop={8}
								onPress={onDelete}
								style={({ pressed }) => [pressed && styles.pressed]}
							>
								<Text style={styles.deleteText}>DELETE</Text>
							</Pressable>
						) : (
							<View />
						)}
						<View style={styles.modalActionsRight}>
							<Pressable
								hitSlop={8}
								onPress={onCancel}
								style={({ pressed }) => [pressed && styles.pressed]}
							>
								<Text style={styles.cancelText}>CANCEL</Text>
							</Pressable>
							<Pressable
								disabled={!valid}
								onPress={() =>
									onSave({
										label: trimmed,
										color,
										action,
										sceneName: action === "scene" ? sceneName : null,
									})
								}
								style={({ pressed }) => [
									styles.saveButton,
									!valid && styles.disabled,
									pressed && styles.pressed,
								]}
							>
								<Text style={styles.saveText}>SAVE</Text>
							</Pressable>
						</View>
					</View>
				</View>
			</View>
		</Modal>
	);
}

const RED = "#ff3757";
const INK = "#07090d";
const PANEL = "#11141a";
const LINE = "#292e38";
const MUTED = "#8c94a3";

const styles = StyleSheet.create({
	accountBlock: { alignItems: "flex-end", gap: 6, maxWidth: "45%" },
	accountName: { color: "#d7dbe2", fontSize: 12, fontWeight: "700" },
	appBackground: { backgroundColor: INK, flex: 1 },
	brandMark: {
		alignItems: "center",
		backgroundColor: RED,
		borderRadius: 4,
		height: 44,
		justifyContent: "center",
		transform: [{ skewX: "-7deg" }],
		width: 44,
	},
	brandMarkText: { color: "white", fontSize: 24, fontWeight: "900" },
	brandName: {
		color: "white",
		fontSize: 20,
		fontWeight: "900",
		letterSpacing: 1,
	},
	brandRow: { alignItems: "center", flexDirection: "row", gap: 14 },
	connectionRow: {
		alignItems: "center",
		flexDirection: "row",
		gap: 8,
		marginTop: 6,
	},
	connectionText: {
		color: "white",
		fontSize: 17,
		fontWeight: "900",
		letterSpacing: 0.8,
	},
	addKey: {
		alignItems: "center",
		aspectRatio: 1,
		backgroundColor: "#12151b",
		borderColor: LINE,
		borderRadius: 16,
		borderStyle: "dashed",
		borderWidth: 1,
		gap: 6,
		justifyContent: "center",
	},
	addKeyLabel: {
		color: MUTED,
		fontSize: 10,
		fontWeight: "900",
		letterSpacing: 1,
	},
	addKeyPlus: { color: MUTED, fontSize: 30, fontWeight: "300" },
	cancelText: {
		color: MUTED,
		fontSize: 12,
		fontWeight: "900",
		letterSpacing: 1,
	},
	controlDisabled: { opacity: 0.42 },
	deck: { flexDirection: "row", flexWrap: "wrap", marginTop: 24 },
	deckEdit: { marginTop: 24 },
	deckHint: {
		color: "#626a77",
		fontSize: 10,
		fontWeight: "800",
		letterSpacing: 1,
		marginTop: 16,
		textAlign: "center",
	},
	deleteText: {
		color: "#ff8fa1",
		fontSize: 12,
		fontWeight: "900",
		letterSpacing: 1,
	},
	disabled: { opacity: 0.45 },
	editToggle: {
		borderColor: LINE,
		borderRadius: 4,
		borderWidth: 1,
		justifyContent: "center",
		minHeight: 34,
		paddingHorizontal: 12,
	},
	editToggleOn: { backgroundColor: RED, borderColor: RED },
	editToggleText: {
		color: MUTED,
		fontSize: 10,
		fontWeight: "900",
		letterSpacing: 1,
	},
	editToggleTextOn: { color: "white" },
	fieldLabel: {
		color: MUTED,
		fontSize: 10,
		fontWeight: "900",
		letterSpacing: 1.4,
		marginBottom: 8,
		marginTop: 20,
	},
	input: {
		backgroundColor: "#151921",
		borderColor: LINE,
		borderRadius: 10,
		borderWidth: 1,
		color: "white",
		fontSize: 16,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	key: {
		backgroundColor: "#171b22",
		borderColor: LINE,
		borderRadius: 16,
		borderWidth: 1,
		flex: 1,
		justifyContent: "space-between",
		padding: 14,
	},
	keyDragging: {
		borderColor: "#e9ebef",
		shadowColor: "#000",
		shadowOffset: { height: 8, width: 0 },
		shadowOpacity: 0.5,
		shadowRadius: 14,
		transform: [{ scale: 1.06 }],
	},
	keyIndex: {
		color: "#626a77",
		fontSize: 10,
		fontWeight: "900",
		letterSpacing: 1,
	},
	keyLabel: {
		color: "#e9ebef",
		fontSize: 16,
		fontWeight: "800",
		lineHeight: 20,
	},
	keyState: {
		color: "#626a77",
		fontSize: 9,
		fontWeight: "900",
		letterSpacing: 1.2,
	},
	keyTop: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	led: {
		backgroundColor: "#363c46",
		borderRadius: 4,
		height: 8,
		width: 8,
	},
	emptyCopy: {
		color: MUTED,
		fontSize: 16,
		lineHeight: 25,
		marginTop: 16,
		maxWidth: 600,
	},
	emptyIndex: { color: RED, fontSize: 13, fontWeight: "900", letterSpacing: 2 },
	emptyState: {
		backgroundColor: PANEL,
		borderColor: LINE,
		borderLeftColor: RED,
		borderLeftWidth: 4,
		borderWidth: 1,
		marginTop: 42,
		padding: 28,
	},
	emptyTitle: {
		color: "white",
		fontSize: 24,
		fontWeight: "900",
		marginTop: 10,
	},
	errorText: { color: "#ff8fa1", fontSize: 14, lineHeight: 20, marginTop: 20 },
	eyebrow: {
		color: MUTED,
		fontSize: 10,
		fontWeight: "800",
		letterSpacing: 1.8,
	},
	footerStatus: {
		color: "#626a77",
		fontSize: 10,
		fontWeight: "800",
		letterSpacing: 1.4,
		marginTop: 32,
		textAlign: "center",
	},
	kickButton: { backgroundColor: "#53fc18" },
	kickButtonText: { color: "#071005" },
	loading: {
		alignItems: "center",
		backgroundColor: INK,
		flex: 1,
		justifyContent: "center",
	},
	loadingText: {
		color: MUTED,
		fontSize: 10,
		fontWeight: "800",
		letterSpacing: 1.5,
		marginTop: 14,
	},
	noScenes: {
		borderColor: LINE,
		borderRadius: 16,
		borderStyle: "dashed",
		borderWidth: 1,
		padding: 28,
		width: "100%",
	},
	noScenesText: {
		color: MUTED,
		fontSize: 12,
		fontWeight: "800",
		letterSpacing: 1,
		textAlign: "center",
	},
	notice: {
		alignItems: "center",
		backgroundColor: "#32151c",
		borderColor: "#6f2635",
		borderWidth: 1,
		flexDirection: "row",
		gap: 12,
		justifyContent: "space-between",
		marginTop: 18,
		padding: 14,
	},
	noticeDismiss: {
		color: "#ff9aab",
		fontSize: 9,
		fontWeight: "900",
		letterSpacing: 1,
	},
	noticeText: { color: "#ffd4db", flex: 1, fontSize: 13 },
	pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
	safeArea: { flex: 1 },
	scrollContent: { alignSelf: "center", paddingBottom: 32, paddingTop: 20 },
	securityNote: {
		color: "#636b78",
		fontSize: 11,
		lineHeight: 17,
		marginTop: 22,
	},
	signalGlow: {
		backgroundColor: "rgba(255,55,87,0.08)",
		borderRadius: 260,
		height: 520,
		position: "absolute",
		right: -260,
		top: -250,
		width: 520,
	},
	signInBackground: { backgroundColor: INK, flex: 1 },
	signInButton: {
		alignItems: "center",
		marginTop: 12,
		paddingHorizontal: 20,
		paddingVertical: 17,
	},
	signInButtonText: {
		color: "white",
		fontSize: 12,
		fontWeight: "900",
		letterSpacing: 0.8,
	},
	signInCopy: {
		color: MUTED,
		fontSize: 16,
		lineHeight: 25,
		marginBottom: 12,
		marginTop: 18,
	},
	signInPanel: { maxWidth: 500, width: "100%" },
	signInSafeArea: { flex: 1 },
	signInScroll: {
		alignItems: "center",
		flexGrow: 1,
		justifyContent: "center",
		padding: 28,
	},
	signInTitle: {
		color: "white",
		fontSize: 36,
		fontWeight: "900",
		letterSpacing: -1.2,
		lineHeight: 40,
		marginTop: 54,
	},
	signOut: {
		borderBottomColor: "#555d69",
		borderBottomWidth: 1,
		minHeight: 44,
		paddingTop: 12,
	},
	signOutText: {
		color: MUTED,
		fontSize: 9,
		fontWeight: "900",
		letterSpacing: 1,
	},
	statusDot: {
		backgroundColor: "#4b515c",
		borderRadius: 5,
		height: 9,
		width: 9,
	},
	statusDotConnected: {
		backgroundColor: "#35e67a",
		shadowColor: "#35e67a",
		shadowOpacity: 0.9,
		shadowRadius: 6,
	},
	tileWrap: { aspectRatio: 1 },
	topActions: { alignItems: "center", flexDirection: "row", gap: 12 },
	topBar: {
		alignItems: "flex-start",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	twitchButton: { backgroundColor: "#9146ff" },

	modalBackdrop: {
		backgroundColor: "rgba(0,0,0,0.72)",
		flex: 1,
		justifyContent: "flex-end",
	},
	modalCard: {
		backgroundColor: "#0d1015",
		borderColor: LINE,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		borderTopWidth: 1,
		padding: 24,
		paddingBottom: 36,
	},
	modalTitle: {
		color: "white",
		fontSize: 18,
		fontWeight: "900",
		letterSpacing: 0.5,
	},
	sceneList: { maxHeight: 200 },
	sceneRow: {
		alignItems: "center",
		backgroundColor: "#151921",
		borderColor: LINE,
		borderRadius: 10,
		borderWidth: 1,
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 8,
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	sceneRowOn: { borderColor: RED },
	sceneRowText: { color: "#e9ebef", flex: 1, fontSize: 15, fontWeight: "700" },
	sceneRowCheck: { color: RED, fontSize: 12, marginLeft: 10 },
	modalNote: { color: MUTED, fontSize: 13, lineHeight: 19 },
	swatchRow: { flexDirection: "row", gap: 12 },
	swatch: {
		borderColor: "transparent",
		borderRadius: 17,
		borderWidth: 2,
		height: 34,
		width: 34,
	},
	swatchNone: { backgroundColor: "#151921", borderColor: LINE },
	swatchOn: { borderColor: "white" },
	modalActions: {
		alignItems: "center",
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 28,
	},
	modalActionsRight: { alignItems: "center", flexDirection: "row", gap: 20 },
	saveButton: {
		backgroundColor: RED,
		borderRadius: 8,
		paddingHorizontal: 22,
		paddingVertical: 12,
	},
	saveText: {
		color: "white",
		fontSize: 12,
		fontWeight: "900",
		letterSpacing: 1,
	},
});
