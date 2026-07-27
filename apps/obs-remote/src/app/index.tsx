import { useRef, useState } from "react";
import {
	ActivityIndicator,
	Pressable,
	ScrollView,
	StyleSheet,
	Text,
	useWindowDimensions,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiClient, authCallbackURL, authClient } from "../lib/backend";
import { useObsLive } from "../lib/use-obs-live";

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
				setError(
					`${provider} sign-in did not establish a session. Try again.`,
				);
			}
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: `${provider} sign-in failed`,
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
	const [busy, setBusy] = useState<"stream" | string>();
	const [commandError, setCommandError] = useState<string>();
	const [signingOut, setSigningOut] = useState(false);
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
	const notice = commandError ?? live.error;

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
							<Text style={styles.eyebrow}>VISP / LIVE CONTROL</Text>
							<View style={styles.connectionRow}>
								<StatusDot connected={connected} />
								<Text style={styles.connectionText}>{connectionLabel}</Text>
							</View>
						</View>
						<View style={styles.accountBlock}>
							<Text numberOfLines={1} style={styles.accountName}>
								{session.user.name}
							</Text>
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
					) : (
						<View style={[styles.deck, { gap: keyGap }]}>
							<Pressable
								accessibilityHint={
									connected
										? undefined
										: "OBS must be online to control streaming"
								}
								accessibilityLabel={
									status?.streaming ? "Stop OBS stream" : "Start OBS stream"
								}
								accessibilityRole="button"
								accessibilityState={{ disabled: controlsDisabled }}
								disabled={controlsDisabled}
								onPress={() => void setStreaming()}
								style={({ pressed }) => [
									styles.key,
									styles.streamKey,
									{ width: keyWidth },
									status?.streaming && styles.streamKeyLive,
									controlsDisabled && styles.controlDisabled,
									pressed && styles.pressed,
								]}
							>
								<View style={styles.keyTop}>
									<Text style={styles.keyIndex}>ON AIR</Text>
									<View
										style={[
											styles.led,
											status?.streaming && styles.ledLive,
										]}
									/>
								</View>
								<Text
									numberOfLines={2}
									style={[
										styles.streamKeyLabel,
										status?.streaming && styles.streamKeyLabelLive,
									]}
								>
									{status?.pending
										? "WAIT"
										: status?.streaming
											? "STOP"
											: connected
												? "GO LIVE"
												: "OFFLINE"}
								</Text>
								<Text style={styles.keyState}>
									{busy === "stream"
										? "SENDING"
										: status?.streaming
											? "LIVE"
											: "READY"}
								</Text>
							</Pressable>

							{status?.scenes.map((scene, index) => {
								const selected = scene === status.currentScene;
								const disabled = controlsDisabled || selected;
								return (
									<Pressable
										accessibilityLabel={`Switch OBS to ${scene}`}
										accessibilityRole="button"
										accessibilityState={{ disabled, selected }}
										disabled={disabled}
										key={scene}
										onPress={() => void setScene(scene)}
										style={({ pressed }) => [
											styles.key,
											{ width: keyWidth },
											selected && styles.keySelected,
											!selected && controlsDisabled && styles.controlDisabled,
											pressed && styles.pressed,
										]}
									>
										<View style={styles.keyTop}>
											<Text style={styles.keyIndex}>
												{String(index + 1).padStart(2, "0")}
											</Text>
											<View
												style={[styles.led, selected && styles.ledSelected]}
											/>
										</View>
										<Text numberOfLines={2} style={styles.keyLabel}>
											{scene}
										</Text>
										<Text style={styles.keyState}>
											{busy === scene
												? "SENDING"
												: selected
													? "PROGRAM"
													: "STANDBY"}
										</Text>
									</Pressable>
								);
							})}

							{!status?.scenes.length ? (
								<View style={styles.noScenes}>
									<Text style={styles.noScenesText}>
										{connected
											? "OBS HAS NOT REPORTED ANY SCENES"
											: "SCENES APPEAR WHEN OBS CONNECTS"}
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
		</View>
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
	controlDisabled: { opacity: 0.42 },
	deck: { flexDirection: "row", flexWrap: "wrap", marginTop: 24 },
	disabled: { opacity: 0.45 },
	key: {
		aspectRatio: 1,
		backgroundColor: "#171b22",
		borderColor: LINE,
		borderRadius: 16,
		borderWidth: 1,
		justifyContent: "space-between",
		padding: 14,
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
	keySelected: {
		backgroundColor: "#1d1318",
		borderColor: RED,
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
	ledLive: {
		backgroundColor: RED,
		shadowColor: RED,
		shadowOpacity: 0.9,
		shadowRadius: 6,
	},
	ledSelected: {
		backgroundColor: RED,
		shadowColor: RED,
		shadowOpacity: 0.9,
		shadowRadius: 6,
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
	streamKey: {
		backgroundColor: "#12211a",
		borderColor: "#1f6f47",
	},
	streamKeyLabel: {
		color: "#5bf29a",
		fontSize: 18,
		fontWeight: "900",
		letterSpacing: -0.3,
		lineHeight: 20,
	},
	streamKeyLabelLive: { color: "#ff8fa1" },
	streamKeyLive: {
		backgroundColor: "#3a111b",
		borderColor: RED,
	},
	topBar: {
		alignItems: "flex-start",
		flexDirection: "row",
		justifyContent: "space-between",
	},
	twitchButton: { backgroundColor: "#9146ff" },
});
