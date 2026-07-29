import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		// Workspace packages must be inlined for the single-file deploy artifact.
		alwaysBundle: [/@VISP\/.*/],
		// Bundling `pg` into dist makes Bun segfault on TLS (UpCloud Postgres).
		// Keep the real package on disk and let Bun resolve it at runtime.
		neverBundle: ["pg"],
	},
});
