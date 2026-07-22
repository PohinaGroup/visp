import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          "User-agent: *\nAllow: /\nSitemap: https://docs.visp-stream.com/sitemap.xml\n",
          { headers: { "Content-Type": "text/plain; charset=utf-8" } },
        ),
    },
  },
});
