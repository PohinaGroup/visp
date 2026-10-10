/**
 * OBS pairing codes are Better Auth device-authorization user codes: eight
 * characters from an alphabet without 0/O or 1/I. Better Auth matches them
 * ignoring case and any separators, so normalise the same way.
 */
export const OBS_CLIENT_ID = "visp-obs";

const USER_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function normalizeDeviceCode(value: string) {
	return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isDeviceCode(normalized: string) {
	return USER_CODE.test(normalized);
}

/** ABCD-EFGH, the way OBS shows it. */
export function formatDeviceCode(normalized: string) {
	return normalized.length === 8
		? `${normalized.slice(0, 4)}-${normalized.slice(4)}`
		: normalized;
}
