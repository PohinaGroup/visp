import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { Suspense } from "react";

import {
	absoluteSiteUrl,
	BLOG_AUTHOR,
	BLOG_PUBLISHER,
	blogMdxComponents,
	formatBlogDate,
} from "@/lib/blog";
import { findBlogPost, listBlogPosts } from "@/lib/blog.server";
import { type Locale, localizedHead } from "@/lib/i18n";

export const loadPost = createServerFn({ method: "GET" })
	.validator((data: { locale: Locale; slug: string }) => data)
	.handler(({ data: { locale, slug } }) => {
		const post = findBlogPost(slug, locale);
		if (!post) throw notFound();
		return {
			post,
			related: listBlogPosts(locale)
				.filter((candidate) => candidate.slug !== slug)
				.slice(0, 2),
		};
	});

export const clientLoader = browserCollections.blogPosts.createClientLoader({
	component({ default: MDX }) {
		return (
			<div className="blog-prose">
				<MDX components={blogMdxComponents} />
			</div>
		);
	},
});

export const Route = createFileRoute("/blog/$slug")({
	loader: async ({ params }) => {
		const data = await loadPost({ data: { locale: "en", slug: params.slug } });
		await clientLoader.preload(data.post.path);
		return data;
	},
	head: ({ loaderData }) => blogPostHead(loaderData, "en"),
	component: () => <BlogPostPage data={Route.useLoaderData()} locale="en" />,
});

export function blogPostHead(
	loaderData: Awaited<ReturnType<typeof loadPost>> | undefined,
	locale: Locale,
) {
	if (!loaderData) return {};
	const { post } = loaderData;
	const canonical = absoluteSiteUrl(post.url);
	const image = absoluteSiteUrl(post.coverUrl);
	const modified = post.updatedAt ?? post.publishedAt;
	return {
		meta: [
			{ title: `${post.title} | VISP` },
			{ name: "description", content: post.description },
			{ property: "og:type", content: "article" },
			{ property: "og:site_name", content: "VISP" },
			{ property: "og:title", content: post.title },
			{ property: "og:description", content: post.description },
			{ property: "og:url", content: canonical },
			{ property: "og:image", content: image },
			{ property: "og:image:alt", content: post.coverAlt },
			{ property: "article:published_time", content: post.publishedAt },
			{ property: "article:modified_time", content: modified },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: post.title },
			{ name: "twitter:description", content: post.description },
			{ name: "twitter:image", content: image },
		],
		links: localizedHead(locale, post.url),
		scripts: [
			{
				type: "application/ld+json",
				children: JSON.stringify({
					"@context": "https://schema.org",
					"@type": "Article",
					headline: post.title,
					description: post.description,
					image,
					datePublished: post.publishedAt,
					dateModified: modified,
					author: { "@type": "Organization", name: BLOG_AUTHOR },
					publisher: {
						"@type": "Organization",
						name: BLOG_PUBLISHER,
						url: absoluteSiteUrl("/"),
					},
					mainEntityOfPage: canonical,
				}),
			},
		],
	};
}

export function BlogPostPage({
	data,
	locale,
}: {
	data: Awaited<ReturnType<typeof loadPost>>;
	locale: Locale;
}) {
	const { post, related } = data;
	const fi = locale === "fi";

	return (
		<main className="min-h-full bg-background px-6 py-10 text-foreground sm:py-14">
			<article className="mx-auto max-w-[820px]">
				<nav
					aria-label={fi ? "Sivupolku" : "Breadcrumb"}
					className="text-muted-foreground text-sm"
				>
					<Link
						to={fi ? "/fi/blog" : "/blog"}
						className="hover:text-foreground hover:underline"
					>
						{fi ? "Blogi" : "Blog"}
					</Link>
					<span aria-hidden className="px-2">
						/
					</span>
					<span>{post.title}</span>
				</nav>

				<header className="mt-8">
					<h1 className="font-display font-semibold text-4xl uppercase leading-[1.02] tracking-tight sm:text-6xl">
						{post.title}
					</h1>
					<p className="mt-6 text-lg text-muted-foreground leading-relaxed">
						{post.description}
					</p>
					<p className="mt-5 font-mono text-muted-foreground text-xs uppercase tracking-wider">
						{fi ? "Kirjoittaja" : "By"} {BLOG_AUTHOR} ·{" "}
						<time dateTime={post.publishedAt}>
							{formatBlogDate(post.publishedAt, locale)}
						</time>
					</p>
					<img
						src={post.coverUrl}
						alt={post.coverAlt}
						width={1200}
						height={630}
						fetchPriority="high"
						className="mt-9 aspect-[40/21] w-full border border-border object-cover"
					/>
				</header>

				<div className="mt-10">
					<Suspense>{clientLoader.useContent(post.path)}</Suspense>
				</div>

				<section className="mt-16 border-border border-y py-10 text-center">
					<h2 className="font-display font-semibold text-3xl uppercase tracking-tight">
						{fi
							? "Tuo kenttä osaksi OBS-studiotasi"
							: "Bring the field into your OBS studio"}
					</h2>
					<p className="mx-auto mt-3 max-w-xl text-muted-foreground">
						{fi
							? "Kokeile VISPiä ilmaiseksi betan ajan. Twitchin tai Kickin lähetysavaimesi pysyy kotona."
							: "Try VISP free during beta. Your Twitch or Kick stream key stays at home."}
					</p>
					<Link
						to="/login"
						search={fi ? { lang: "fi" } : {}}
						className="mt-6 inline-flex h-11 items-center justify-center bg-primary px-6 font-medium text-primary-foreground hover:opacity-90"
					>
						{fi ? "Kokeile VISPiä ilmaiseksi" : "Try VISP free"}
					</Link>
				</section>

				{related.length > 0 && (
					<section className="mt-12">
						<h2 className="font-display font-semibold text-2xl uppercase tracking-tight">
							{fi ? "Aiheeseen liittyvät oppaat" : "Related guides"}
						</h2>
						<ul className="mt-5 grid gap-4 sm:grid-cols-2">
							{related.map((candidate) => (
								<li key={candidate.slug}>
									<Link
										to={fi ? "/fi/blog/$slug" : "/blog/$slug"}
										params={{ slug: candidate.slug }}
										className="block h-full border border-border p-5 hover:border-foreground/40"
									>
										<span className="font-display font-semibold text-lg uppercase leading-tight">
											{candidate.title}
										</span>
									</Link>
								</li>
							))}
						</ul>
					</section>
				)}
			</article>
		</main>
	);
}
