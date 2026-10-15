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

> VISP sends phone and browser cameras through an authenticated relay directly to Twitch, Kick, or YouTube, with no computer needed. The same feed can optionally be read in your own OBS. The native app can combine Wi-Fi and cellular over SRTLA, send every packet over both, or keep one as a backup.

## Pages

- [Phone only](${legalEntity.siteUrl}/phone-only): Stream from a phone with no computer and no OBS. When mobile data drops, viewers see your BRB card instead of a dead stream, or your uploaded highlight clips with Plus. Multistream and Cloud Studio overlays (beta) run on VISP's servers; Network bonding runs in the app.
- [With OBS](${legalEntity.siteUrl}/with-obs): Use your phone as a camera in the OBS you already run, from anywhere and with no open ports, through the VISP OBS plugin.

## How VISP compares

VISP is free, and a computer at home is optional. The optional Plus plan (€9/month)
adds hosted extras such as BRB highlight clips; Direct streaming stays free. Cloud
IRL services include their own OBS but bill monthly; relay-only services are
cheaper but still require you to run OBS yourself. VISP can combine Wi-Fi and
cellular over SRTLA, send every packet over both connections, or use one as a
backup. A service with SRTLA ingest or BELABOX hardware may still be the better
fit if you want a dedicated bonding encoder.

${comparisonMarkdown()}

Public list prices, checked ${COMPARISON_CHECKED}. See ${legalEntity.siteUrl}/with-obs#compare.

## Affiliate program

Creators with an audience can apply to the Affiliate program, and founding
creators are set up the same way: both get every feature free (Plus quotas
apply). See ${legalEntity.siteUrl}/affiliate.

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
