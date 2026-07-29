import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		// Workspace packages and `pg` must be inlined for Node production
		// (`node dist/index.mjs`). Bun workspaces do not expose `@VISP/db`'s
		// `pg` where Node can resolve it from apps/server; Bun itself also
		// segfaults on Postgres TLS, so production does not use Bun here.
		alwaysBundle: ["pg", /@VISP\/.*/],
	},
});
