import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { trackEvent, trackOnce } from "@/lib/analytics";

const SIGN_IN_METHODS = new Set(["twitch", "kick", "google"]);

export function AuthAnalytics() {
	const location = useLocation();

	useEffect(() => {
		const params = new URLSearchParams(location.searchStr);
		const method = params.get("auth_method");
		if (!method || !SIGN_IN_METHODS.has(method)) return;

		trackOnce(`sign_in:${method}`, () =>
			trackEvent("sign_in", { method }),
		);

		params.delete("auth_method");
		const nextSearch = params.toString();
		const nextUrl = `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
		window.history.replaceState({}, "", nextUrl);
	}, [location.pathname, location.searchStr]);

	return null;
}
