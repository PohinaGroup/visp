import type { MDXComponents } from "mdx/types";
import type { ComponentPropsWithoutRef } from "react";

import { legalEntity } from "./legal";

export const BLOG_AUTHOR = "VISP Team";
export const BLOG_PUBLISHER = legalEntity.companyName;

export type BlogPostSummary = {
	coverAlt: string;
	coverUrl: string;
	description: string;
	path: string;
	publishedAt: string;
	slug: string;
	title: string;
	updatedAt?: string;
	url: string;
};

const coverUrls = import.meta.glob<string>("../../content/blog/*/cover.png", {
	eager: true,
	import: "default",
	query: "?url",
});

export function coverUrlForSlug(slug: string) {
	const suffix = `/${slug}/cover.png`;
	const entry = Object.entries(coverUrls).find(([path]) =>
		path.endsWith(suffix),
	);
	if (!entry) throw new Error(`Missing cover.png for blog post: ${slug}`);
	return entry[1];
}

export function absoluteSiteUrl(path: string) {
	return new URL(path, legalEntity.siteUrl).toString();
}

export function formatBlogDate(date: string, locale: "en" | "fi" = "en") {
	return new Intl.DateTimeFormat(locale, {
		dateStyle: "long",
		timeZone: "UTC",
	}).format(new Date(`${date}T00:00:00Z`));
}

function BlogImage(props: ComponentPropsWithoutRef<"img">) {
	const { alt, ...imageProps } = props;
	return (
		<img
			{...imageProps}
			alt={alt}
			width={1600}
			height={900}
			loading="lazy"
			decoding="async"
		/>
	);
}

export const blogMdxComponents: MDXComponents = {
	img: BlogImage,
};
