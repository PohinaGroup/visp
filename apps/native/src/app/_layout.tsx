import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { ExpoUiWebFixes } from "../components/expo-ui-web-fixes";

export default function RootLayout() {
	return (
		<GestureHandlerRootView style={{ flex: 1 }}>
			<ExpoUiWebFixes />
			<Stack screenOptions={{ headerShown: false }} />
		</GestureHandlerRootView>
	);
}
