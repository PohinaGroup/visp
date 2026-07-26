import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
	return (
		<SafeAreaProvider>
			<StatusBar style="light" />
			<Stack
				screenOptions={{
					contentStyle: { backgroundColor: "#07090d" },
					headerShown: false,
				}}
			/>
		</SafeAreaProvider>
	);
}
