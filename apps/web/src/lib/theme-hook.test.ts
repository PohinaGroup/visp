import { afterAll, afterEach, expect, test } from "bun:test";
// @ts-expect-error jsdom ships no types in this workspace
import { JSDOM } from "jsdom";

import { THEME_KEY, useThemeState } from "./theme";

const globalNames = [
	"window",
	"document",
	"navigator",
	"localStorage",
	"Event",
	"HTMLElement",
	"Node",
	"MutationObserver",
	"IS_REACT_ACT_ENVIRONMENT",
] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let dom: JSDOM;
let renderHook: typeof import("@testing-library/react").renderHook;
let act: typeof import("@testing-library/react").act;
let cleanup: typeof import("@testing-library/react").cleanup;
let prefersDark = false;

function setGlobal(name: string, value: unknown) {
	saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
	Object.defineProperty(globalThis, name, {
		value,
		configurable: true,
		writable: true,
	});
}

function setup() {
	dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "https://visp.localhost/",
	});
	const w = dom.window;
	w.matchMedia = () => ({
		get matches() {
			return prefersDark;
		},
		addEventListener() {},
		removeEventListener() {},
	});
	setGlobal("window", w);
	setGlobal("document", w.document);
	setGlobal("navigator", w.navigator);
	setGlobal("localStorage", w.localStorage);
	setGlobal("Event", w.Event);
	setGlobal("HTMLElement", w.HTMLElement);
	setGlobal("Node", w.Node);
	setGlobal("MutationObserver", w.MutationObserver);
	setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
}

// Globals must exist before @testing-library/react loads, and it registers its own
// hooks on import, so this runs at module level rather than in beforeAll.
setup();
({ renderHook, act, cleanup } = await import("@testing-library/react"));

afterEach(() => {
	cleanup();
	localStorage.clear();
	document.documentElement.className = "";
	document.documentElement.removeAttribute("data-theme");
	prefersDark = false;
});

afterAll(() => {
	for (const name of globalNames) {
		const original = saved.get(name);
		if (original) {
			Object.defineProperty(globalThis, name, original);
		} else {
			delete (globalThis as Record<string, unknown>)[name];
		}
	}
	dom.window.close();
});

const html = () => document.documentElement;

test("does not touch the pre-paint class until storage is read, then applies it", () => {
	html().classList.add("dark");
	localStorage.setItem(THEME_KEY, "dark");
	const { result } = renderHook(() => useThemeState("/"));
	// layout effects have flushed: stored value read, class kept dark
	expect(result.current.preference).toBe("dark");
	expect(result.current.resolved).toBe("dark");
	expect(html().classList.contains("dark")).toBe(true);
	expect(html().getAttribute("data-theme")).toBe("dark");
});

test("stored light removes a dark class and resolves light", () => {
	html().classList.add("dark");
	localStorage.setItem(THEME_KEY, "light");
	const { result } = renderHook(() => useThemeState("/"));
	expect(result.current.resolved).toBe("light");
	expect(html().classList.contains("dark")).toBe(false);
	expect(html().getAttribute("data-theme")).toBe("light");
});

test("system preference follows the OS", () => {
	prefersDark = true;
	const { result } = renderHook(() => useThemeState("/"));
	expect(result.current.preference).toBe("system");
	expect(result.current.resolved).toBe("dark");
});

test("forced-dark path stays dark with stored light and follows client navigation", () => {
	localStorage.setItem(THEME_KEY, "light");
	const { result, rerender } = renderHook(({ path }) => useThemeState(path), {
		initialProps: { path: "/dashboard" },
	});
	expect(result.current.resolved).toBe("dark");
	expect(html().classList.contains("dark")).toBe(true);
	rerender({ path: "/" });
	expect(result.current.resolved).toBe("light");
	expect(html().classList.contains("dark")).toBe(false);
	rerender({ path: "/studio" });
	expect(html().classList.contains("dark")).toBe(true);
});

test("setPreference is shared between hook instances and persisted", () => {
	const a = renderHook(() => useThemeState("/"));
	const b = renderHook(() => useThemeState("/"));
	expect(a.result.current.resolved).toBe("light");
	act(() => {
		b.result.current.setPreference("dark");
	});
	expect(localStorage.getItem(THEME_KEY)).toBe("dark");
	expect(a.result.current.preference).toBe("dark");
	expect(a.result.current.resolved).toBe("dark");
	expect(b.result.current.resolved).toBe("dark");
	expect(html().classList.contains("dark")).toBe(true);
	act(() => {
		a.result.current.setPreference("light");
	});
	expect(b.result.current.preference).toBe("light");
	expect(html().classList.contains("dark")).toBe(false);
});
