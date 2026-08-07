import * as AppleAuthentication from "expo-apple-authentication";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
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
import { openLegalUrl, PRIVACY_URL, TERMS_URL } from "../lib/legal";
import { IS_IOS } from "../lib/platform";
import {
	METER_BARS,
	streamScreenStyles as styles,
} from "./stream-screen.styles";

/** App Store 5.1.1(i): privacy policy must be reachable inside the app. */
function LegalAgreement() {
	return (
		<Text style={styles.legalText}>
			By continuing, you agree to the{" "}
			<Text
				accessibilityRole="link"
				onPress={() => openLegalUrl(TERMS_URL)}
				style={styles.legalLink}
			>
				Terms of Service
			</Text>{" "}
			and{" "}
			<Text
				accessibilityRole="link"
				onPress={() => openLegalUrl(PRIVACY_URL)}
				style={styles.legalLink}
			>
				Privacy Policy
			</Text>
			.
		</Text>
	);
}

// The de-neoned VISP lockup: wordmark + level-meter mark.
function BrandLockup() {
	return (
		<View style={styles.brandRow}>
			<Text style={styles.wordmark}>VISP</Text>
			<View style={styles.meterMark}>
				{METER_BARS.map((height) => (
					<View key={height} style={[styles.meterBar, { height }]} />
				))}
			</View>
		</View>
	);
}

export function StreamLoading({
	label = "Loading publish destination...",
}: {
	label?: string;
} = {}) {
	return (
		<View style={styles.loading}>
			<StatusBar style="light" />
			<BrandLockup />
			<ActivityIndicator color="#ffffff" />
			<Text style={styles.loadingText}>{label}</Text>
		</View>
	);
}

export type SignInProvider = "apple" | "google" | "kick" | "twitch";

// Rendered only where Apple supports it: the module ships a stub that answers
// false on Android and web, and the button itself renders nothing there.
function AppleSignInButton({
	disabled,
	onPress,
}: {
	disabled: boolean;
	onPress: () => void;
}) {
	const [available, setAvailable] = useState(false);

	useEffect(() => {
		let active = true;
		void AppleAuthentication.isAvailableAsync().then((supported) => {
			if (active) setAvailable(supported);
		});
		return () => {
			active = false;
		};
	}, []);

	if (!available) return null;
	return (
		<AppleAuthentication.AppleAuthenticationButton
			buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
			buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
			cornerRadius={4}
			onPress={onPress}
			pointerEvents={disabled ? "none" : "auto"}
			style={[styles.appleButton, disabled && styles.buttonDisabled]}
		/>
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
	onSignIn: (provider: SignInProvider) => void;
	signingIn?: SignInProvider;
}) {
	return (
		<View style={styles.setupBackground}>
			<StatusBar style="light" />
			<SafeAreaView style={styles.setup}>
				<BrandLockup />
				<Text style={styles.eyebrow}>Sign in</Text>
				<Text style={styles.title}>Sign in to VISP</Text>
				<Text style={styles.subtitle}>
					{IS_IOS
						? "Apple, Twitch, Kick, or Google loads your relay destination automatically."
						: "Twitch, Kick, or Google loads your relay destination automatically."}
				</Text>
				{message ? <Text style={styles.formError}>{message}</Text> : null}
				<AppleSignInButton
					disabled={Boolean(signingIn)}
					onPress={() => onSignIn("apple")}
				/>
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
					onPress={() => onSignIn("google")}
					style={({ pressed }) => [
						styles.secondaryButton,
						signingIn && styles.buttonDisabled,
						pressed && styles.buttonPressed,
					]}
				>
					<Text style={styles.secondaryButtonText}>
						{signingIn === "google"
							? "Opening Google..."
							: "Continue with Google"}
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
				<LegalAgreement />
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
	hasInstallation,
	message,
	onCancel,
	onChangeDraft,
	onProvision,
	onSave,
	provisioning,
	signedIn,
	streamUrl,
}: {
	draft: string;
	hasInstallation: boolean;
	message?: string;
	onCancel: () => void;
	onChangeDraft: (draft: string) => void;
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
				<BrandLockup />
				<Text style={styles.eyebrow}>Destination</Text>
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
				{signedIn && !streamUrl ? (
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
				) : null}
				<Pressable
					accessibilityRole="button"
					onPress={onCancel}
					style={styles.textButton}
				>
					<Text style={styles.textButtonLabel}>Cancel</Text>
				</Pressable>
				<LegalAgreement />
			</SafeAreaView>
		</KeyboardAvoidingView>
	);
}
