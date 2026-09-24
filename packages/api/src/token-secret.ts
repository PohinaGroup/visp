import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

function hashToken(secret: string) {
	return createHash("sha256").update(secret).digest("hex");
}

export function createToken() {
	const id = randomBytes(12).toString("hex");
	const secret = randomBytes(32).toString("hex");
	return { id, hash: hashToken(secret), value: `${id}.${secret}` };
}

export function parseToken(value: string | undefined) {
	if (!value) return null;
	const [id, secret, extra] = value.split(".");
	return !extra &&
		/^[a-f0-9]{24}$/.test(id ?? "") &&
		/^[a-f0-9]{64}$/.test(secret ?? "")
		? { id: id as string, secret: secret as string }
		: null;
}

export function tokenMatches(secret: string, storedHash: string) {
	const given = Buffer.from(hashToken(secret), "hex");
	const stored = Buffer.from(storedHash, "hex");
	return stored.length === given.length && timingSafeEqual(stored, given);
}
