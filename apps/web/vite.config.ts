import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
	server: {
		host: process.env.HOST ?? "127.0.0.1",
		port: Number(process.env.PORT ?? 3001),
	},
	resolve: {
		tsconfigPaths: true,
	},
	ssr: {
		// theme-neutral's /built entry uses extensionless relative imports that
		// Node ESM can't resolve when externalized; bundle it instead.
		noExternal: ["@astryxdesign/theme-neutral"],
	},
	plugins: [
		mdx(),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
		nitro(),
	],
});
