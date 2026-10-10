// DB-backed tests point the shared pool at the test database before anything
// parses the env module, the same way apps/server/src/test-env.ts does.
if (process.env.TEST_DATABASE_URL) {
	process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

import "./test-env";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const { createHostedUsageBuffer, flushHostedUsage, recordHostedUsage } =
	await import("./hosted-usage");
type HostedUsageRow = import("./hosted-usage").HostedUsageRow;

const quiet = () => {
	const warnings: string[] = [];
	const errors: string[] = [];
	return {
		warnings,
		errors,
		log: {
			warn: (message: unknown) => void warnings.push(String(message)),
			error: (message: unknown) => void errors.push(String(message)),
		},
	};
};

describe("hosted usage buffer", () => {
	test("sums per user, feature, unit and provider into one write", async () => {
		const writes: HostedUsageRow[][] = [];
		const buffer = createHostedUsageBuffer({
			write: async (rows) => void writes.push(rows),
		});

		buffer.record({
			userId: "u1",
			feature: "tts",
			units: 12,
			unit: "characters",
			provider: "elevenlabs",
		});
		buffer.record({
			userId: "u1",
			feature: "tts",
			units: 30,
			unit: "characters",
			provider: "elevenlabs",
		});
		buffer.record({
			userId: "u1",
			feature: "tts",
			units: 5,
			unit: "characters",
		});
		buffer.record({
			userId: "u2",
			feature: "subtitles",
			units: 1.2,
			unit: "seconds",
			provider: "deepgram",
		});
		buffer.record({
			userId: "u2",
			feature: "subtitles",
			units: 0.3,
			unit: "seconds",
			provider: "deepgram",
		});
		await buffer.flush();

		expect(writes).toHaveLength(1);
		expect(writes[0]).toEqual([
			{
				userId: "u1",
				feature: "tts",
				units: 42,
				unit: "characters",
				provider: "elevenlabs",
			},
			{
				userId: "u1",
				feature: "tts",
				units: 5,
				unit: "characters",
				provider: null,
			},
			// Fractions are summed first; the whole part is written and the
			// remaining half second carries to the next flush.
			{
				userId: "u2",
				feature: "subtitles",
				units: 1,
				unit: "seconds",
				provider: "deepgram",
			},
		]);
		expect(buffer.size()).toBe(0);
		expect(buffer.carried()).toBe(1);

		// A carried fraction alone is not a write.
		await buffer.flush();
		expect(writes).toHaveLength(1);
	});

	test("carries fractions between flushes so long sessions bill exactly", async () => {
		const writes: HostedUsageRow[][] = [];
		const buffer = createHostedUsageBuffer({
			write: async (rows) => void writes.push(rows),
		});
		// An hour of audio isolation in 0.1 s chunks, flushed every "minute"
		// with 59.3 s of audio each: ceil-per-flush would bill 3,600 s for
		// 3,558 s used.
		for (let minute = 0; minute < 60; minute += 1) {
			for (let chunk = 0; chunk < 593; chunk += 1) {
				buffer.record({
					userId: "u1",
					feature: "audio_isolation",
					units: 0.1,
					unit: "seconds",
				});
			}
			await buffer.flush();
		}
		await buffer.flush({ final: true });

		const billed = writes.flat().reduce((total, row) => total + row.units, 0);
		expect(billed).toBe(3558);
		expect(writes.flat().every((row) => Number.isInteger(row.units))).toBe(
			true,
		);
		expect(buffer.carried()).toBe(0);
	});

	test("the final flush rounds carried fractions to the nearest unit", async () => {
		const writes: HostedUsageRow[][] = [];
		const buffer = createHostedUsageBuffer({
			write: async (rows) => void writes.push(rows),
		});
		buffer.record({
			userId: "up",
			feature: "audio_isolation",
			units: 2.6,
			unit: "seconds",
		});
		buffer.record({
			userId: "down",
			feature: "audio_isolation",
			units: 0.4,
			unit: "seconds",
		});
		await buffer.flush();
		expect(writes).toEqual([
			[
				{
					userId: "up",
					feature: "audio_isolation",
					units: 2,
					unit: "seconds",
					provider: null,
				},
			],
		]);
		expect(buffer.carried()).toBe(2);

		await buffer.flush({ final: true });
		// 0.6 rounds up to one more second; 0.4 rounds away.
		expect(writes[1]).toEqual([
			{
				userId: "up",
				feature: "audio_isolation",
				units: 1,
				unit: "seconds",
				provider: null,
			},
		]);
		expect(buffer.carried()).toBe(0);
		expect(buffer.size()).toBe(0);
	});

	test("a carried fraction survives a failed write", async () => {
		const writes: HostedUsageRow[][] = [];
		let fail = true;
		const { log } = quiet();
		const buffer = createHostedUsageBuffer({
			write: async (rows) => {
				if (fail) throw new Error("database is down");
				writes.push(rows);
			},
			log,
		});
		buffer.record({
			userId: "u1",
			feature: "subtitles",
			units: 1.75,
			unit: "seconds",
		});
		await buffer.flush();
		expect(buffer.size()).toBe(1);
		expect(buffer.carried()).toBe(1);

		fail = false;
		buffer.record({
			userId: "u1",
			feature: "subtitles",
			units: 0.5,
			unit: "seconds",
		});
		await buffer.flush();
		// 1 (retried) + 0.75 (carried) + 0.5 (new) = 2 whole, 0.25 carried.
		expect(writes.flat().map((row) => row.units)).toEqual([2]);
		expect(buffer.carried()).toBe(1);
	});

	test("carried fractions beyond the key bound drop the oldest", async () => {
		const writes: HostedUsageRow[][] = [];
		const { log, warnings } = quiet();
		const buffer = createHostedUsageBuffer({
			write: async (rows) => void writes.push(rows),
			maxKeys: 2,
			log,
		});
		for (const batch of [["a", "b"], ["c"]]) {
			for (const userId of batch) {
				buffer.record({
					userId,
					feature: "subtitles",
					units: 0.9,
					unit: "seconds",
				});
			}
			await buffer.flush();
		}
		expect(buffer.carried()).toBe(2);
		await buffer.flush({ final: true });
		expect(writes.flat().map((row) => row.userId)).toEqual(["b", "c"]);
		// Losing under a unit per idle key is not worth an operator warning.
		expect(warnings).toHaveLength(0);
	});

	test("ignores invalid events without throwing into the caller", async () => {
		const writes: HostedUsageRow[][] = [];
		const { log, warnings } = quiet();
		const buffer = createHostedUsageBuffer({
			write: async (rows) => void writes.push(rows),
			log,
		});

		expect(() => {
			buffer.record({
				userId: "u1",
				feature: "tts",
				units: 0,
				unit: "characters",
			});
			buffer.record({
				userId: "u1",
				feature: "tts",
				units: Number.NaN,
				unit: "characters",
			});
			buffer.record({
				userId: "",
				feature: "tts",
				units: 3,
				unit: "characters",
			});
			buffer.record({
				userId: "u1",
				feature: "karaoke" as "tts",
				units: 3,
				unit: "characters",
			});
		}).not.toThrow();
		await buffer.flush();

		expect(writes).toHaveLength(0);
		expect(warnings).toHaveLength(4);
	});

	test("keeps a failed batch and merges it into the next flush", async () => {
		const writes: HostedUsageRow[][] = [];
		let fail = true;
		const { log, errors } = quiet();
		const buffer = createHostedUsageBuffer({
			write: async (rows) => {
				if (fail) throw new Error("database is down");
				writes.push(rows);
			},
			log,
		});

		buffer.record({
			userId: "u1",
			feature: "tts",
			units: 10,
			unit: "characters",
		});
		await expect(buffer.flush()).resolves.toBeUndefined();
		expect(errors).toHaveLength(1);
		expect(buffer.size()).toBe(1);

		buffer.record({
			userId: "u1",
			feature: "tts",
			units: 5,
			unit: "characters",
		});
		buffer.record({
			userId: "u2",
			feature: "tts",
			units: 1,
			unit: "characters",
		});
		fail = false;
		await buffer.flush();

		expect(writes).toEqual([
			[
				{
					userId: "u1",
					feature: "tts",
					units: 15,
					unit: "characters",
					provider: null,
				},
				{
					userId: "u2",
					feature: "tts",
					units: 1,
					unit: "characters",
					provider: null,
				},
			],
		]);
	});

	test("drops the oldest keys beyond the bound, with one warning", async () => {
		const writes: HostedUsageRow[][] = [];
		let fail = true;
		const { log, warnings } = quiet();
		const buffer = createHostedUsageBuffer({
			write: async (rows) => {
				if (fail) throw new Error("database is down");
				writes.push(rows);
			},
			maxKeys: 2,
			log,
		});

		buffer.record({
			userId: "old",
			feature: "tts",
			units: 1,
			unit: "characters",
		});
		await buffer.flush();
		buffer.record({
			userId: "mid",
			feature: "tts",
			units: 1,
			unit: "characters",
		});
		buffer.record({
			userId: "new",
			feature: "tts",
			units: 1,
			unit: "characters",
		});
		buffer.record({
			userId: "newest",
			feature: "tts",
			units: 1,
			unit: "characters",
		});
		expect(buffer.size()).toBe(2);
		expect(warnings.filter((w) => w.includes("buffer is full"))).toHaveLength(
			1,
		);

		fail = false;
		await buffer.flush();
		expect(writes[0]?.map((row) => row.userId)).toEqual(["new", "newest"]);
	});

	test("serialises flushes so a slow write is never overtaken", async () => {
		const order: string[] = [];
		let release: () => void = () => {};
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const buffer = createHostedUsageBuffer({
			write: async (rows) => {
				if (rows[0]?.userId === "first") await gate;
				order.push(...rows.map((row) => row.userId));
			},
		});

		buffer.record({
			userId: "first",
			feature: "tts",
			units: 1,
			unit: "characters",
		});
		const first = buffer.flush();
		buffer.record({
			userId: "second",
			feature: "tts",
			units: 1,
			unit: "characters",
		});
		const second = buffer.flush();
		release();
		await Promise.all([first, second]);

		expect(order).toEqual(["first", "second"]);
	});
});

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;

integration("hosted usage in Postgres", () => {
	const userId = `hosted-usage-${crypto.randomUUID()}`;
	const goneUserId = `hosted-usage-gone-${crypto.randomUUID()}`;

	beforeAll(async () => {
		const { db } = await import("@VISP/db");
		const { user } = await import("@VISP/db/schema/index");
		await db.insert(user).values({
			id: userId,
			name: "Hosted usage test",
			email: `${userId}@example.test`,
			emailVerified: true,
		});
	});

	afterAll(async () => {
		const { db } = await import("@VISP/db");
		const { user } = await import("@VISP/db/schema/index");
		const { eq } = await import("drizzle-orm");
		await db.delete(user).where(eq(user.id, userId));
	});

	test("one flush writes the aggregated rows and skips deleted users", async () => {
		const { db } = await import("@VISP/db");
		const { hostedUsage } = await import("@VISP/db/schema/index");
		const { asc, eq } = await import("drizzle-orm");

		recordHostedUsage({
			userId,
			feature: "tts",
			units: 12,
			unit: "characters",
			provider: "elevenlabs",
		});
		recordHostedUsage({
			userId,
			feature: "tts",
			units: 30,
			unit: "characters",
			provider: "elevenlabs",
		});
		recordHostedUsage({
			userId,
			feature: "audio_isolation",
			units: 90,
			unit: "seconds",
		});
		// A user deleted between recording and flushing must not wedge the batch.
		recordHostedUsage({
			userId: goneUserId,
			feature: "tts",
			units: 7,
			unit: "characters",
			provider: "elevenlabs",
		});
		await flushHostedUsage();

		const rows = await db
			.select({
				feature: hostedUsage.feature,
				units: hostedUsage.units,
				unit: hostedUsage.unit,
				provider: hostedUsage.provider,
			})
			.from(hostedUsage)
			.where(eq(hostedUsage.userId, userId))
			.orderBy(asc(hostedUsage.feature));
		expect(rows).toEqual([
			{
				feature: "audio_isolation",
				units: 90,
				unit: "seconds",
				provider: null,
			},
			{ feature: "tts", units: 42, unit: "characters", provider: "elevenlabs" },
		]);
		const gone = await db
			.select({ id: hostedUsage.id })
			.from(hostedUsage)
			.where(eq(hostedUsage.userId, goneUserId));
		expect(gone).toHaveLength(0);

		// Nothing left over to be written twice.
		await flushHostedUsage();
		const again = await db
			.select({ id: hostedUsage.id })
			.from(hostedUsage)
			.where(eq(hostedUsage.userId, userId));
		expect(again).toHaveLength(2);
	});

	test("the table refuses usage that could not be billed", async () => {
		const { db } = await import("@VISP/db");
		const { hostedUsage } = await import("@VISP/db/schema/index");

		await expect(
			db
				.insert(hostedUsage)
				.values({ userId, feature: "tts", units: 0, unit: "characters" })
				.execute(),
		).rejects.toThrow();
		await expect(
			db
				.insert(hostedUsage)
				.values({
					userId,
					feature: "tts",
					units: 1,
					unit: "minutes" as "seconds",
				})
				.execute(),
		).rejects.toThrow();
	});

	test("a catch-all price cannot be entered twice for the same moment", async () => {
		const { db } = await import("@VISP/db");
		const { unitPrice } = await import("@VISP/db/schema/index");
		const { eq } = await import("drizzle-orm");
		const validFrom = new Date("2000-01-01T00:00:00Z");
		const price = {
			feature: "tts" as const,
			unit: "characters" as const,
			eurPerUnit: "0.00015000",
			validFrom,
		};

		try {
			await db.insert(unitPrice).values(price);
			await expect(
				db.insert(unitPrice).values(price).execute(),
			).rejects.toThrow();
		} finally {
			await db.delete(unitPrice).where(eq(unitPrice.validFrom, validFrom));
		}
	});
});
