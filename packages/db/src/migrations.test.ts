import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"migrations",
);

describe("migration journal", () => {
	// Drizzle only applies migrations listed in _journal.json, so a .sql file
	// missing an entry is skipped in silence: db:migrate still prints success
	// while the table never lands. A reformat commit dropped entry 12 that way.
	test("lists every migration file", () => {
		const journal = JSON.parse(
			readFileSync(join(migrationsDir, "meta/_journal.json"), "utf8"),
		) as { entries: { tag: string }[] };
		const files = readdirSync(migrationsDir)
			.filter((name) => name.endsWith(".sql"))
			.map((name) => name.replace(/\.sql$/, ""))
			.sort();

		expect(journal.entries.map((entry) => entry.tag).sort()).toEqual(files);
	});
});
