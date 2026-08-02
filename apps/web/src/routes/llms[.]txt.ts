import { createFileRoute } from "@tanstack/react-router";

import { absoluteSiteUrl } from "@/lib/blog";
import { listBlogPosts } from "@/lib/blog.server";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET: () => {
				const posts = listBlogPosts()
					.map(
						(post) =>
							`- [${post.title}](${absoluteSiteUrl(post.url)}): ${post.description}`,
					)
					.join("\n");

				return new Response(
					`# VISP

> VISP sends phone and browser cameras through an authenticated SRT relay directly to Twitch or Kick. The same contribution feed can optionally be read in OBS. VISP does not bond networks.

## Documentation

- [VISP documentation](${legalEntity.docsUrl}/docs)
- [Full documentation for language models](${legalEntity.docsUrl}/llms-full.txt)

## Blog

${posts}
`,
					{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
				);
			},
		},
	},
});
