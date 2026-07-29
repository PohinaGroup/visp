import { defineConfig } from "tsdown";

export default defineConfig({
	entry: "./src/index.ts",
	format: "esm",
	outDir: "./dist",
	clean: true,
	deps: {
		// Workspace packages, `pg`, and the Node Elysia adapter must be inlined
		// for `node dist/index.mjs`. Bun workspaces hide transitive deps from
		// Node's resolver; Bun itself also segfaults on Postgres TLS.
		alwaysBundle: ["pg", "@elysia/node", "srvx", "crossws", /@VISP\/.*/],
		// Native NAPI loader uses createRequire/require; bundling it into this
		// ESM entry (which has top-level await) crashes Node 22 with
		// ERR_AMBIGUOUS_MODULE_SYNTAX. Keep it external and install it on the
		// server package so Node can resolve it from WorkingDirectory.
		neverBundle: ["@node-rs/argon2"],
	},
});
