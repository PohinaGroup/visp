import { createFileRoute } from "@tanstack/react-router";

import {
	BlogPostPage,
	blogPostHead,
	clientLoader,
	loadPost,
} from "@/routes/blog.$slug";

export const Route = createFileRoute("/fi/blog/$slug")({
	loader: async ({ params }) => {
		const data = await loadPost({ data: { locale: "fi", slug: params.slug } });
		await clientLoader.preload(data.post.path);
		return data;
	},
	head: ({ loaderData }) => blogPostHead(loaderData, "fi"),
	component: () => <BlogPostPage data={Route.useLoaderData()} locale="fi" />,
});
