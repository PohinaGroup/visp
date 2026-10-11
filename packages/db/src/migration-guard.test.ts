import { describe, expect, test } from "bun:test";

import {
	DEFAULT_LOCK_TIMEOUT_MS,
	isLockTimeout,
	migrationSettings,
	positiveIntFromEnv,
	retryOnLockTimeout,
} from "./migration-guard";

const lockTimeout = () =>
	Object.assign(new Error("canceling statement due to lock timeout"), {
		code: "55P03",
	});

describe("migration settings", () => {
	test("defaults apply when unset or blank", () => {
		expect(migrationSettings({}).lockTimeoutMs).toBe(DEFAULT_LOCK_TIMEOUT_MS);
		expect(positiveIntFromEnv("X", 7, { X: " " })).toBe(7);
	});

	test("reads overrides and rejects junk", () => {
		expect(
			migrationSettings({
				MIGRATION_LOCK_TIMEOUT_MS: "2000",
				MIGRATION_STATEMENT_TIMEOUT_MS: "60000",
				MIGRATION_LOCK_ATTEMPTS: "1",
			}),
		).toEqual({ lockTimeoutMs: 2000, statementTimeoutMs: 60000, attempts: 1 });
		for (const bad of ["5s", "0", "-1", "1.5"]) {
			expect(() => positiveIntFromEnv("X", 1, { X: bad })).toThrow(
				"X must be a positive integer",
			);
		}
	});
});

describe("lock timeout detection", () => {
	test("finds the Postgres code through drizzle's cause chain", () => {
		expect(isLockTimeout(lockTimeout())).toBe(true);
		expect(
			isLockTimeout(new Error("Failed query", { cause: lockTimeout() })),
		).toBe(true);
		expect(isLockTimeout(Object.assign(new Error(), { code: "57014" }))).toBe(
			false,
		);
		expect(isLockTimeout(undefined)).toBe(false);
	});
});

describe("retryOnLockTimeout", () => {
	const noSleep = async () => {};

	test("retries lock timeouts until success", async () => {
		let calls = 0;
		const retried: number[] = [];
		const result = await retryOnLockTimeout(
			async () => {
				calls++;
				if (calls < 3) throw lockTimeout();
				return "done";
			},
			{
				attempts: 3,
				backoffMs: 1,
				sleep: noSleep,
				onRetry: (n) => retried.push(n),
			},
		);
		expect(result).toBe("done");
		expect(retried).toEqual([1, 2]);
	});

	test("gives up after the last attempt", async () => {
		let calls = 0;
		await expect(
			retryOnLockTimeout(
				async () => {
					calls++;
					throw lockTimeout();
				},
				{ attempts: 2, backoffMs: 1, sleep: noSleep },
			),
		).rejects.toMatchObject({ code: "55P03" });
		expect(calls).toBe(2);
	});

	test("does not retry other errors", async () => {
		let calls = 0;
		await expect(
			retryOnLockTimeout(
				async () => {
					calls++;
					throw new Error("syntax error");
				},
				{ attempts: 3, backoffMs: 1, sleep: noSleep },
			),
		).rejects.toThrow("syntax error");
		expect(calls).toBe(1);
	});
});
