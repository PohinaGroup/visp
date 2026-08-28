import { env } from "@VISP/env/server";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
	return Buffer.from(env.PUBLISH_URL_ENCRYPTION_KEY, "base64");
}

export function encryptSecret(plaintext: string, aad: string) {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key(), iv);
	cipher.setAAD(Buffer.from(aad, "utf8"));
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	return [
		"v1",
		iv.toString("base64url"),
		cipher.getAuthTag().toString("base64url"),
		encrypted.toString("base64url"),
	].join(".");
}

export function decryptSecret(value: string, aad: string) {
	const [version, ivValue, tagValue, encryptedValue] = value.split(".");
	if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
		throw new Error("Stored secret cannot be revealed");
	}
	try {
		const decipher = createDecipheriv(
			"aes-256-gcm",
			key(),
			Buffer.from(ivValue, "base64url"),
		);
		decipher.setAAD(Buffer.from(aad, "utf8"));
		decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
		return Buffer.concat([
			decipher.update(Buffer.from(encryptedValue, "base64url")),
			decipher.final(),
		]).toString("utf8");
	} catch {
		throw new Error("Stored secret cannot be revealed");
	}
}
