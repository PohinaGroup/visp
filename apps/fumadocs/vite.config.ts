import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? 4000),
    strictPort: true,
  },
  plugins: [
    mdx(),
    tailwindcss(),
    tanstackStart({
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
          crawlLinks: true,
        },
      },

      pages: [
        {
          path: "/docs",
        },
        {
          path: "/fi",
        },
        {
          path: "/fi/docs",
        },
        {
          path: "/api/search",
        },
        {
          path: "/llms-full.txt",
        },
        {
          path: "/llms.txt",
        },
        {
          path: "/robots.txt",
        },
        {
          path: "/sitemap.xml",
        },
      ],
    }),
    react(),
    // please see https://tanstack.com/start/latest/docs/framework/react/guide/hosting#nitro for guides on hosting
    nitro(),
    // ponytail: Nitro turns port 0 into 3000; remove when it preserves ephemeral preview ports.
    {
      name: "restore-random-prerender-port",
      apply: (_, { isPreview }) => Boolean(isPreview),
      config: () => ({ preview: { port: 0 } }),
    },
  ],
  resolve: {
    tsconfigPaths: true,
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /^use-sync-external-store\/shim$/,
        replacement: "react",
      },
      {
        find: "tslib",
        replacement: "tslib/tslib.es6.js",
      },
    ],
  },
});
