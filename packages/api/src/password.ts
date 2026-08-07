import { hash, verify } from "@node-rs/argon2";

const ARGON2ID = {
	algorithm: 2,
	memoryCost: 65536,
	parallelism: 1,
	timeCost: 2,
} as const;

export async function hashSecret(plaintext: string) {
	return hash(plaintext, ARGON2ID);
}

export async function verifySecret(plaintext: string, secretHash: string) {
	return verify(secretHash, plaintext);
}
