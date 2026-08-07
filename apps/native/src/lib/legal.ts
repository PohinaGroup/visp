import { Linking } from "react-native";

/** Public site used for App Store / Play privacy disclosures (matches apps/web). */
const SITE = "https://visp-stream.com";

export const PRIVACY_URL = `${SITE}/privacy`;
export const TERMS_URL = `${SITE}/terms`;
export const REQUEST_DELETE_URL = `${SITE}/request-delete`;

/** Opens a legal page in the system browser (App Store 5.1.1(i)). */
export function openLegalUrl(url: string) {
	void Linking.openURL(url);
}
