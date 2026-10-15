import { useLocation } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
export const THEME_KEY = "visp-theme";
// Same-tab signal so every useThemeState instance (root + toggle) stays in sync.
const THEME_EVENT = "visp-theme-change";

export type ThemePreference = "light" | "dark" | "system";

// App chrome is designed dark-only. Matches whole segments so `/authors` stays public.
// Stringified into themeInitScript: keep it self-contained.
export function isForcedDarkPath(pathname: string): boolean {
	return /^\/(dashboard|setup|studio|overlay|device|login|auth)(\/|$)/.test(
		pathname,
	);
}

// Runs before first paint (inline in <head>) so the saved/OS theme never flashes.
export const themeInitScript = `(function(){var f=(${isForcedDarkPath.toString()});var d=false,s=null;try{s=localStorage.getItem("${THEME_KEY}")}catch(e){}if(s==="light"||s==="dark"){d=s==="dark"}else{try{d=matchMedia("(prefers-color-scheme: dark)").matches}catch(e){}}if(f(location.pathname))d=true;var r=document.documentElement;if(d){r.classList.add("dark")}else{r.classList.remove("dark")}r.setAttribute("data-theme",d?"dark":"light")})()`;

// Fallback for browsers where storage throws (private mode): keep the choice in memory.
let memoryPreference: ThemePreference = "system";

function readPreference(): ThemePreference {
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored === "light" || stored === "dark" || stored === "system") {
			return stored;
		}
		return "system";
	} catch {
		return memoryPreference;
	}
}

const useIsomorphicLayoutEffect =
	typeof window === "undefined" ? useEffect : useLayoutEffect;

// Router-free so it can be tested with renderHook; useThemePreference supplies the pathname.
export function useThemeState(pathname: string) {
	const forcedDark = isForcedDarkPath(pathname);
	// null until storage has been read: nothing is applied before that, so the
	// pre-paint script's class is never overwritten with a placeholder.
	const [preference, setPreferenceState] = useState<ThemePreference | null>(
		null,
	);
	const [systemDark, setSystemDark] = useState(false);
	// "light" on server and first client render keeps hydration identical.
	const [resolved, setResolved] = useState<"light" | "dark">("light");

	useIsomorphicLayoutEffect(() => {
		const sync = () => setPreferenceState(readPreference());
		sync();
		window.addEventListener(THEME_EVENT, sync);
		window.addEventListener("storage", sync);

		const query = window.matchMedia?.("(prefers-color-scheme: dark)");
		const onSystem = () => setSystemDark(query?.matches ?? false);
		onSystem();
		query?.addEventListener("change", onSystem);

		return () => {
			window.removeEventListener(THEME_EVENT, sync);
			window.removeEventListener("storage", sync);
			query?.removeEventListener("change", onSystem);
		};
	}, []);

	useIsomorphicLayoutEffect(() => {
		if (preference === null) {
			return;
		}
		const dark =
			forcedDark ||
			preference === "dark" ||
			(preference === "system" && systemDark);
		const root = document.documentElement;
		root.classList.toggle("dark", dark);
		root.setAttribute("data-theme", dark ? "dark" : "light");
		setResolved(dark ? "dark" : "light");
	}, [preference, systemDark, forcedDark, pathname]);

	function setPreference(next: ThemePreference) {
		memoryPreference = next;
		try {
			localStorage.setItem(THEME_KEY, next);
		} catch {
			// storage blocked: memoryPreference covers this session
		}
		window.dispatchEvent(new Event(THEME_EVENT));
	}

	return { preference, resolved, setPreference };
}

export function useThemePreference() {
	const pathname = useLocation({ select: (l) => l.pathname });
	return useThemeState(pathname);
}
