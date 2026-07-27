import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { trackPageview } from "../lib/analytics";

export default function RootLayout() {
	const pathname = usePathname();

	useEffect(() => {
		trackPageview(pathname);
	}, [pathname]);

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
