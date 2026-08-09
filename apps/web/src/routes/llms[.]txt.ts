import { createFileRoute } from "@tanstack/react-router";

import { absoluteSiteUrl } from "@/lib/blog";
import { listBlogPosts } from "@/lib/blog.server";
import { COMPARISON_CHECKED, comparisonMarkdown } from "@/lib/comparison";
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

> VISP sends phone and browser cameras through an authenticated relay directly to Twitch, Kick, or YouTube. The same contribution feed can optionally be read in OBS. The native app can duplicate packets over Wi-Fi and cellular without aggregating their capacity.

## How VISP compares

VISP is free during the beta and needs no computer running at home. Cloud IRL
services include their own OBS but bill monthly; relay-only services are cheaper
but still require you to run OBS yourself. VISP does not aggregate cellular and
Wi-Fi bandwidth — for real bonding today, BELABOX or a service with SRTLA ingest
is the better fit.

${comparisonMarkdown()}

Public list prices, checked ${COMPARISON_CHECKED}. See ${legalEntity.siteUrl}/#compare.

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
