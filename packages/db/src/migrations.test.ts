import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"migrations",
);

function readJournal() {
	return JSON.parse(
		readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8"),
	) as { entries: { idx: number; tag: string; when: number }[] };
}

function readSnapshots() {
	return readdirSync(join(migrationsDir, "meta"))
		.filter((name) => name.endsWith("_snapshot.json"))
		.sort()
		.map((name) => {
			const snapshot = JSON.parse(
				readFileSync(join(migrationsDir, "meta", name), "utf8"),
			) as { id: string; prevId: string };
			return { name, id: snapshot.id, prevId: snapshot.prevId };
		});
}

describe("migration journal", () => {
	// Drizzle only applies migrations listed in _journal.json, so a .sql file
	// missing an entry is skipped in silence: db:migrate still prints success
	// while the table never lands. A reformat commit dropped entry 12 that way.
	test("lists every migration file", () => {
		const journal = readJournal();
		const files = readdirSync(migrationsDir)
			.filter((name) => name.endsWith(".sql"))
			.map((name) => name.replace(/\.sql$/, ""))
			.sort();

		expect(journal.entries.map((entry) => entry.tag).sort()).toEqual(files);
	});

	// The migrator skips any entry whose `when` is not newer than the last
	// applied migration, so out-of-order timestamps silently drop migrations.
	test("entries are ordered by idx and strictly increasing when", () => {
		const { entries } = readJournal();
		entries.forEach((entry, index) => {
			expect(entry.idx).toBe(index);
			if (index > 0) {
				expect(entry.when).toBeGreaterThan(entries[index - 1]?.when ?? 0);
			}
		});
	});
});

describe("migration snapshots", () => {
	// drizzle-kit generate diffs the schema against the newest snapshot only.
	// When hand-written migrations skip the snapshot, the next generate
	// re-emits CREATE TABLE for everything they added and fails on real DBs.
	test("latest journal entry has a snapshot", () => {
		const { entries } = readJournal();
		const latest = entries.at(-1);
		const prefix = latest?.tag.split("_")[0];
		expect(readSnapshots().map((snapshot) => snapshot.name)).toContain(
			`${prefix}_snapshot.json`,
		);
	});

	test("snapshots form an unbroken id/prevId chain", () => {
		const snapshots = readSnapshots();
		expect(new Set(snapshots.map((snapshot) => snapshot.id)).size).toBe(
			snapshots.length,
		);
		snapshots.forEach((snapshot, index) => {
			const expectedPrev =
				snapshots[index - 1]?.id ?? "00000000-0000-0000-0000-000000000000";
			expect(`${snapshot.name} -> ${snapshot.prevId}`).toBe(
				`${snapshot.name} -> ${expectedPrev}`,
			);
		});
	});
});
