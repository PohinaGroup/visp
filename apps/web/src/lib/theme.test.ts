import { expect, test } from "bun:test";

import { isForcedDarkPath, THEME_KEY, themeInitScript } from "./theme";

function runInit(opts: {
	stored: string | null;
	prefersDark: boolean;
	path: string;
}) {
	const classes = new Set<string>();
	const attrs: Record<string, string> = {};
	const localStorage = {
		getItem(key: string) {
			if (key !== THEME_KEY) {
				return null;
			}
			if (opts.stored === "throw") {
				throw new Error("storage blocked");
			}
			return opts.stored;
		},
	};
	const matchMedia = () => ({ matches: opts.prefersDark });
	const location = { pathname: opts.path };
	const document = {
		documentElement: {
			classList: {
				add: (c: string) => classes.add(c),
				remove: (c: string) => classes.delete(c),
			},
			setAttribute: (k: string, v: string) => {
				attrs[k] = v;
			},
		},
	};
	new Function(
		"localStorage",
		"matchMedia",
		"location",
		"document",
		themeInitScript,
	)(localStorage, matchMedia, location, document);
	return { dark: classes.has("dark"), dataTheme: attrs["data-theme"] };
}

test("forced-dark paths", () => {
	for (const p of [
		"/dashboard",
		"/dashboard/streams",
		"/setup",
		"/studio",
		"/overlay",
		"/device",
		"/login",
		"/auth",
		"/auth/agent-approval",
	]) {
		expect(isForcedDarkPath(p)).toBe(true);
	}
	for (const p of [
		"/",
		"/fi",
		"/phone-only",
		"/fi/with-obs",
		"/blog/x",
		"/download",
		"/authors",
		"/login-help",
		"/devices",
	]) {
		expect(isForcedDarkPath(p)).toBe(false);
	}
});

test("init script: stored dark wins on a public page", () => {
	expect(runInit({ stored: "dark", prefersDark: false, path: "/" })).toEqual({
		dark: true,
		dataTheme: "dark",
	});
});

test("init script: stored light beats a dark OS on a public page", () => {
	expect(runInit({ stored: "light", prefersDark: true, path: "/" })).toEqual({
		dark: false,
		dataTheme: "light",
	});
});

test("init script: app route is dark even when stored light", () => {
	expect(
		runInit({ stored: "light", prefersDark: false, path: "/dashboard" }).dark,
	).toBe(true);
});

test("init script: system follows media query; storage throwing falls back", () => {
	expect(runInit({ stored: null, prefersDark: true, path: "/" }).dark).toBe(
		true,
	);
	expect(runInit({ stored: "throw", prefersDark: false, path: "/" }).dark).toBe(
		false,
	);
	expect(runInit({ stored: "throw", prefersDark: true, path: "/" }).dark).toBe(
		true,
	);
});
