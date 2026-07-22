import { createFileRoute } from "@tanstack/react-router";

import { absoluteSiteUrl } from "@/lib/blog";
import { listBlogPosts } from "@/lib/blog.server";

const publicPaths = [
	"/blog",
	"/contact",
	"/cookies",
	"/download",
	"/privacy",
	"/request-delete",
	"/terms",
] as const;

const localizedPaths = [
	"/blog",
	"/contact",
	"/cookies",
	"/privacy",
	"/terms",
] as const;

function alternateLinks(path: (typeof localizedPaths)[number]) {
	return `<xhtml:link rel="alternate" hreflang="en" href="${absoluteSiteUrl(path)}"/><xhtml:link rel="alternate" hreflang="fi" href="${absoluteSiteUrl(`/fi${path}`)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${absoluteSiteUrl(path)}"/>`;
}

export const Route = createFileRoute("/sitemap.xml")({
	server: {
		handlers: {
			GET: () => {
				const homeAlternates = `<xhtml:link rel="alternate" hreflang="en" href="${absoluteSiteUrl("/")}"/><xhtml:link rel="alternate" hreflang="fi" href="${absoluteSiteUrl("/fi")}"/><xhtml:link rel="alternate" hreflang="x-default" href="${absoluteSiteUrl("/")}"/>`;
				const urls = [
					`<url><loc>${absoluteSiteUrl("/")}</loc>${homeAlternates}</url>`,
					`<url><loc>${absoluteSiteUrl("/fi")}</loc>${homeAlternates}</url>`,
					...publicPaths.flatMap((path) => {
						if (
							!localizedPaths.includes(path as (typeof localizedPaths)[number])
						) {
							return [`<url><loc>${absoluteSiteUrl(path)}</loc></url>`];
						}
						const alternates = alternateLinks(
							path as (typeof localizedPaths)[number],
						);
						return [
							`<url><loc>${absoluteSiteUrl(path)}</loc>${alternates}</url>`,
							`<url><loc>${absoluteSiteUrl(`/fi${path}`)}</loc>${alternates}</url>`,
						];
					}),
					...listBlogPosts("en").map(
						(post) =>
							`<url><loc>${absoluteSiteUrl(post.url)}</loc><lastmod>${post.updatedAt ?? post.publishedAt}</lastmod>${alternateLinks(
								"/blog" as const,
							)
								.replaceAll('/blog"', `/blog/${post.slug}"`)
								.replaceAll('/fi/blog"', `/fi/blog/${post.slug}"`)}</url>`,
					),
					...listBlogPosts("fi").map(
						(post) =>
							`<url><loc>${absoluteSiteUrl(post.url)}</loc><lastmod>${post.updatedAt ?? post.publishedAt}</lastmod>${alternateLinks(
								"/blog" as const,
							)
								.replaceAll('/blog"', `/blog/${post.slug}"`)
								.replaceAll('/fi/blog"', `/fi/blog/${post.slug}"`)}</url>`,
					),
				];
				return new Response(
					`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("")}</urlset>`,
					{ headers: { "Content-Type": "application/xml; charset=utf-8" } },
				);
			},
		},
	},
});
