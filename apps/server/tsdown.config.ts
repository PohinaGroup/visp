import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		// Workspace packages must be inlined for the single-file deploy artifact.
		alwaysBundle: [/@VISP\/.*/],
		// Keep `pg` external for Node production (`node dist/index.mjs`). Bundling
		// it breaks TLS to managed Postgres under Bun; Bun also segfaults on TLS
		// when running the bundle or src with an external `pg`.
		neverBundle: ["pg"],
	},
});
