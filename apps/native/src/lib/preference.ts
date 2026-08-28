import { storage } from "./storage";

/**
 * Every boolean preference persists the same way. The fallback applies only to
 * an unset key, so a stored "false" is never mistaken for "never chosen".
 */
export function booleanPreference(key: string, fallback = false) {
	return {
		async load(): Promise<boolean> {
			const value = await storage.getItem(key);
			return value === null ? fallback : value === "true";
		},
		save(enabled: boolean): Promise<void> {
			return storage.setItem(key, enabled ? "true" : "false");
		},
	};
}
