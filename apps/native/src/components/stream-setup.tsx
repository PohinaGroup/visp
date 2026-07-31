import { StatusBar } from "expo-status-bar";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	Text,
	TextInput,
	View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { streamScreenStyles as styles } from "./stream-screen.styles";

export function StreamLoading() {
	return (
		<View style={styles.loading}>
			<StatusBar style="light" />
			<ActivityIndicator color="#ffffff" />
			<Text style={styles.loadingText}>Loading publish destination...</Text>
		</View>
	);
}

export function StreamSignIn({
	message,
	onManualSetup,
	onPreview,
	onSignIn,
	signingIn,
}: {
	message?: string;
	onManualSetup: () => void;
	onPreview: () => void;
	onSignIn: (provider: "twitch" | "kick") => void;
	signingIn?: "twitch" | "kick";
}) {
	return (
		<View style={styles.setupBackground}>
			<StatusBar style="light" />
			<SafeAreaView style={styles.setup}>
				<Text style={styles.title}>Sign in to VISP</Text>
				<Text style={styles.subtitle}>
					Connect Twitch or Kick to load your relay destination automatically.
				</Text>
				{message ? <Text style={styles.formError}>{message}</Text> : null}
				<Pressable
					accessibilityRole="button"
					disabled={Boolean(signingIn)}
					onPress={() => onSignIn("twitch")}
					style={({ pressed }) => [
						styles.primaryButton,
						signingIn && styles.buttonDisabled,
						pressed && styles.buttonPressed,
					]}
				>
					<Text style={styles.primaryButtonText}>
						{signingIn === "twitch"
							? "Opening Twitch..."
							: "Continue with Twitch"}
					</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					disabled={Boolean(signingIn)}
					onPress={() => onSignIn("kick")}
					style={({ pressed }) => [
						styles.secondaryButton,
						signingIn && styles.buttonDisabled,
						pressed && styles.buttonPressed,
					]}
				>
					<Text style={styles.secondaryButtonText}>
						{signingIn === "kick" ? "Opening Kick..." : "Continue with Kick"}
					</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					onPress={onManualSetup}
					style={styles.textButton}
				>
					<Text style={styles.textButtonLabel}>Enter SRT URL manually</Text>
				</Pressable>
				<Pressable
					accessibilityRole="button"
					onPress={onPreview}
					style={styles.textButton}
				>
					<Text style={styles.textButtonLabel}>Look around without URL</Text>
				</Pressable>
			</SafeAreaView>
		</View>
	);
}

export function StreamDestinationEditor({
	draft,
	editing,
	hasInstallation,
	message,
	onCancel,
	onChangeDraft,
	onPreview,
	onProvision,
	onSave,
	provisioning,
	signedIn,
	streamUrl,
}: {
	draft: string;
	editing: boolean;
	hasInstallation: boolean;
	message?: string;
	onCancel: () => void;
	onChangeDraft: (draft: string) => void;
	onPreview: () => void;
	onProvision: () => void;
	onSave: () => void;
	provisioning: boolean;
	signedIn: boolean;
	streamUrl: string | null;
}) {
	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === "ios" ? "padding" : undefined}
			style={styles.setupBackground}
		>
			<StatusBar style="light" />
			<SafeAreaView style={styles.setup}>
				<View style={styles.brandMark}>
					<Text style={styles.brandMarkText}>V</Text>
				</View>
				<Text style={styles.title}>
					{streamUrl
						? "Replace destination"
						: signedIn
							? "Connect VISP"
							: "Manual SRT destination"}
				</Text>
				<Text style={styles.subtitle}>
					{signedIn
						? "VISP fills this automatically. You can paste a publish URL manually if automatic setup fails."
						: "Paste your VISP SRT publish URL to stream without signing in."}
				</Text>
				<TextInput
					accessibilityLabel="VISP SRT publish URL"
					autoComplete="off"
					autoCapitalize="none"
					autoCorrect={false}
					inputMode="url"
					onChangeText={onChangeDraft}
					onSubmitEditing={onSave}
					placeholder="srt://relay.example:8890?..."
					placeholderTextColor="#6f7785"
					secureTextEntry
					style={styles.input}
					value={draft}
				/>
				{message ? <Text style={styles.formError}>{message}</Text> : null}
				<Pressable
					accessibilityRole="button"
					disabled={!draft.trim()}
					onPress={onSave}
					style={({ pressed }) => [
						styles.primaryButton,
						!draft.trim() && styles.buttonDisabled,
						pressed && styles.buttonPressed,
					]}
				>
					<Text style={styles.primaryButtonText}>Save destination</Text>
				</Pressable>
				{editing ? (
					<Pressable
						accessibilityRole="button"
						onPress={onCancel}
						style={styles.textButton}
					>
						<Text style={styles.textButtonLabel}>Cancel</Text>
					</Pressable>
				) : (
					<>
						<Pressable
							accessibilityRole="button"
							disabled={provisioning || !hasInstallation}
							onPress={onProvision}
							style={styles.textButton}
						>
							<Text style={styles.textButtonLabel}>
								{provisioning
									? "Setting up..."
									: !hasInstallation
										? "Preparing device..."
										: "Try automatic setup again"}
							</Text>
						</Pressable>
						<Pressable
							accessibilityRole="button"
							onPress={onPreview}
							style={styles.textButton}
						>
							<Text style={styles.textButtonLabel}>
								Look around without URL
							</Text>
						</Pressable>
					</>
				)}
			</SafeAreaView>
		</KeyboardAvoidingView>
	);
}
