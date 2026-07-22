import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { absoluteSiteUrl, BLOG_AUTHOR, formatBlogDate } from "@/lib/blog";
import { listBlogPosts } from "@/lib/blog.server";
import { type Locale, localizedHead } from "@/lib/i18n";

export const loadPosts = createServerFn({ method: "GET" })
	.validator((locale: Locale) => locale)
	.handler(({ data: locale }) => listBlogPosts(locale));

export const Route = createFileRoute("/blog/")({
	loader: () => loadPosts({ data: "en" }),
	head: () => ({
		meta: [
			{ title: "IRL Streaming and OBS Guides | VISP" },
			{
				name: "description",
				content:
					"Practical guides for remote cameras, resilient mobile streaming, OBS production, SRT, and secure IRL workflows from the VISP team.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: "VISP" },
			{ property: "og:title", content: "IRL Streaming and OBS Guides" },
			{
				property: "og:description",
				content:
					"Practical guides for remote cameras, resilient mobile streaming, and OBS production.",
			},
			{ property: "og:url", content: absoluteSiteUrl("/blog") },
			{ name: "twitter:card", content: "summary" },
		],
		links: localizedHead("en", "/blog"),
	}),
	component: () => <BlogIndex posts={Route.useLoaderData()} locale="en" />,
});

export function BlogIndex({
	posts,
	locale,
}: {
	posts: Awaited<ReturnType<typeof loadPosts>>;
	locale: Locale;
}) {
	const fi = locale === "fi";

	return (
		<main className="min-h-full bg-background px-6 py-14 text-foreground">
			<div className="mx-auto max-w-[1100px]">
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
					{fi ? "Kenttämuistiinpanot" : "Field notes"} · {BLOG_AUTHOR}
				</p>
				<h1 className="mt-4 max-w-3xl font-display font-semibold text-5xl uppercase leading-none tracking-tight sm:text-6xl">
					{fi
						? "IRL-suoratoiston ja OBS:n oppaat"
						: "IRL streaming & OBS guides"}
				</h1>
				<p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
					{fi
						? "Rakenna luotettava etäkameratuotanto luopumatta tutusta OBS-studiosta, kohtauksista, hälytyksistä tai ohjauksista."
						: "Build reliable remote-camera workflows without giving up the OBS studio, scenes, alerts, and controls you already know."}
				</p>

				<ul className="mt-14 grid gap-8 md:grid-cols-2">
					{posts.map((post) => (
						<li key={post.slug}>
							<Link
								to={fi ? "/fi/blog/$slug" : "/blog/$slug"}
								params={{ slug: post.slug }}
								className="group block h-full border border-border bg-card transition-colors hover:border-foreground/40"
							>
								<img
									src={post.coverUrl}
									alt={post.coverAlt}
									width={1200}
									height={630}
									loading="lazy"
									decoding="async"
									className="aspect-[40/21] w-full border-border border-b object-cover"
								/>
								<div className="p-7">
									<time
										dateTime={post.publishedAt}
										className="font-mono text-muted-foreground text-xs uppercase tracking-wider"
									>
										{formatBlogDate(post.publishedAt, locale)}
									</time>
									<h2 className="mt-3 font-display font-semibold text-2xl uppercase leading-tight tracking-tight group-hover:underline group-hover:underline-offset-4">
										{post.title}
									</h2>
									<p className="mt-4 text-muted-foreground leading-relaxed">
										{post.description}
									</p>
								</div>
							</Link>
						</li>
					))}
				</ul>

				<section className="mt-20 border-border border-t pt-14 text-center">
					<h2 className="font-display font-semibold text-4xl uppercase tracking-tight">
						{fi
							? "Tuo puhelin osaksi OBS-studiotasi"
							: "Put a phone in your OBS studio"}
					</h2>
					<p className="mx-auto mt-4 max-w-xl text-muted-foreground">
						{fi
							? "VISP on betan ajan ilmainen. Pidä kohdepalvelun lähetysavain kotona ja tuo kentän kuva sen luo."
							: "VISP is free during beta. Keep your destination stream key at home and bring the field feed to it."}
					</p>
					<Link
						to="/login"
						search={fi ? { lang: "fi" } : {}}
						className="mt-7 inline-flex h-11 items-center justify-center bg-primary px-6 font-medium text-primary-foreground hover:opacity-90"
					>
						{fi ? "Kokeile VISPiä ilmaiseksi" : "Try VISP free"}
					</Link>
				</section>
			</div>
		</main>
	);
}
