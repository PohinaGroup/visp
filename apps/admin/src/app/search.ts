import { useNavigate, useSearch } from "@tanstack/react-router";

/**
 * Query strings stay plain `key=value` pairs instead of TanStack's default
 * JSON encoding, so a hand-written deep link such as `/users?user=<id>` works
 * and an all-digit ID is never parsed into a number. Every value is a string;
 * pages validate what they read.
 */
export function parseSearch(searchStr: string): Record<string, string> {
	return Object.fromEntries(new URLSearchParams(searchStr));
}

export function stringifySearch(search: Record<string, unknown>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(search)) {
		if (value === undefined || value === null || value === "") continue;
		params.set(key, String(value));
	}
	const query = params.toString();
	return query ? `?${query}` : "";
}

/**
 * One query-string value as page state: reading it keeps reloads and shared
 * links on the same view, writing it pushes a history entry so Back works.
 */
export function useSearchParam(
	key: string,
): [string | undefined, (value: string | undefined) => void] {
	const search: Record<string, unknown> = useSearch({ strict: false });
	const navigate = useNavigate();
	const raw = search[key];
	const value = typeof raw === "string" && raw ? raw : undefined;
	const setValue = (next: string | undefined) => {
		void navigate({
			to: ".",
			search: (prev: Record<string, unknown>) => ({ ...prev, [key]: next }),
		});
	};
	return [value, setValue];
}
