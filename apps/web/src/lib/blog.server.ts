import { blogPosts } from "collections/server";
import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { type BlogPostSummary, coverUrlForSlug } from "./blog";
import { contentI18n, type Locale } from "./i18n";

export const blogSource = loader({
	baseUrl: "/blog",
	i18n: contentI18n,
	source: toFumadocsSource(blogPosts, []),
});

function toSummary(page: (typeof blogSource)["$inferPage"]): BlogPostSummary {
	const slug = page.slugs.at(-1);
	if (!slug) throw new Error(`Blog post has no slug: ${page.path}`);

	return {
		coverAlt: page.data.coverAlt,
		coverUrl: coverUrlForSlug(slug),
		description: page.data.description,
		path: page.path,
		publishedAt: page.data.publishedAt,
		slug,
		title: page.data.title,
		updatedAt: page.data.updatedAt,
		url: page.url,
	};
}

export function listBlogPosts(locale: Locale = "en") {
	return blogSource
		.getPages(locale)
		.map(toSummary)
		.sort(
			(a, b) =>
				b.publishedAt.localeCompare(a.publishedAt) ||
				a.title.localeCompare(b.title),
		);
}

export function findBlogPost(slug: string, locale: Locale = "en") {
	const page = blogSource.getPage([slug], locale);
	return page ? toSummary(page) : undefined;
}
