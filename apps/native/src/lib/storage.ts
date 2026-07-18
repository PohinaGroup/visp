import * as SecureStore from "expo-secure-store";

export const storage = {
	getItem(key: string) {
		return SecureStore.getItemAsync(key);
	},
	setItem(key: string, value: string) {
		return SecureStore.setItemAsync(key, value);
	},
};
