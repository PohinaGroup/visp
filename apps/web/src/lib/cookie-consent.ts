export type CookieConsentChoice = "necessary" | "all";

export type CookieConsent = {
	choice: CookieConsentChoice;
	updatedAt: string;
};

const STORAGE_KEY = "visp.cookie-consent";

export function readCookieConsent(): CookieConsent | null {
	if (typeof window === "undefined") {
		return null;
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<CookieConsent>;
		if (parsed.choice !== "necessary" && parsed.choice !== "all") {
			return null;
		}
		if (typeof parsed.updatedAt !== "string") {
			return null;
		}
		return { choice: parsed.choice, updatedAt: parsed.updatedAt };
	} catch {
		return null;
	}
}

export function writeCookieConsent(choice: CookieConsentChoice): CookieConsent {
	const consent: CookieConsent = {
		choice,
		updatedAt: new Date().toISOString(),
	};
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
	window.dispatchEvent(new CustomEvent("visp:cookie-consent", { detail: consent }));
	return consent;
}

export function allowsOptionalCookies(consent: CookieConsent | null): boolean {
	return consent?.choice === "all";
}
