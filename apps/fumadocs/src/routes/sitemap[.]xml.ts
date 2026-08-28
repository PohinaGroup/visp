import { createFileRoute } from "@tanstack/react-router";

import { docsSiteUrl } from "@/lib/shared";
import { source } from "@/lib/source";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const pairs = [
          { en: "/", fi: "/fi" },
          ...source.getPages("en").map((page) => ({
            en: page.url,
            fi: source.getPage(page.slugs, "fi")?.url,
          })),
        ];
        const urls = pairs.flatMap(({ en, fi }) => [
          { path: en, en, fi },
          ...(fi ? [{ path: fi, en, fi }] : []),
        ]);
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.map(({ path, en, fi }) => `<url><loc>${new URL(path, docsSiteUrl)}</loc><xhtml:link rel="alternate" hreflang="en" href="${new URL(en, docsSiteUrl)}"/>${fi ? `<xhtml:link rel="alternate" hreflang="fi" href="${new URL(fi, docsSiteUrl)}"/>` : ""}<xhtml:link rel="alternate" hreflang="x-default" href="${new URL(en, docsSiteUrl)}"/></url>`).join("")}</urlset>`,
          { headers: { "Content-Type": "application/xml; charset=utf-8" } },
        );
      },
    },
  },
});
