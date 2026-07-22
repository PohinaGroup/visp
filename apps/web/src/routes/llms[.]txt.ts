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

> VISP sends remote phone and browser cameras through an authenticated SRT relay into a creator's existing OBS studio. VISP does not bond networks or transcode video.

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
