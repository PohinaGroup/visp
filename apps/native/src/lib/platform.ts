import { Alert, Platform } from "react-native";

export const IS_IOS = Platform.OS === "ios";
export const IS_WEB = Platform.OS === "web";

/**
 * Confirms an irreversible action. `Alert` does nothing on react-native-web, so
 * a shared prompt has to fall back to the browser dialog or the web build would
 * run the action with no confirmation at all.
 */
export function confirmDestructive(
	title: string,
	body: string,
	confirmLabel: string,
	onConfirm: () => Promise<void> | void,
) {
	if (IS_WEB) {
		if (globalThis.confirm(`${title}\n\n${body}`)) void onConfirm();
		return;
	}
	Alert.alert(title, body, [
		{ style: "cancel", text: "Cancel" },
		{
			onPress: () => void onConfirm(),
			style: "destructive",
			text: confirmLabel,
		},
	]);
}
