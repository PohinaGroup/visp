export const storage = {
	async getItem(key: string): Promise<string | null> {
		return typeof localStorage === "undefined"
			? null
			: localStorage.getItem(key);
	},
	async setItem(key: string, value: string): Promise<void> {
		if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
	},
};
