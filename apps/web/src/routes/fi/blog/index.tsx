import { createFileRoute } from "@tanstack/react-router";
import { localizedHead } from "@/lib/i18n";
import { BlogIndex, loadPosts } from "@/routes/blog.index";

export const Route = createFileRoute("/fi/blog/")({
	loader: () => loadPosts({ data: "fi" }),
	head: () => ({
		meta: [
			{ title: "IRL-suoratoiston ja OBS:n oppaat | VISP" },
			{
				name: "description",
				content:
					"Käytännön oppaita etäkameroihin, luotettavaan mobiilisuoratoistoon, OBS-tuotantoon, SRT:hen ja turvallisiin IRL-työnkulkuihin.",
			},
			{ property: "og:type", content: "website" },
			{ property: "og:locale", content: "fi_FI" },
		],
		links: localizedHead("fi", "/fi/blog"),
	}),
	component: () => <BlogIndex posts={Route.useLoaderData()} locale="fi" />,
});
