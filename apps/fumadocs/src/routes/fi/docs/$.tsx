import { createFileRoute } from "@tanstack/react-router";

import { alternateLinks } from "@/lib/i18n";
import { clientLoader, LocalizedDocsPage, loadDocsPage } from "@/routes/docs/$";

export const Route = createFileRoute("/fi/docs/$")({
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await loadDocsPage({ data: { locale: "fi", slugs } });
    await clientLoader.preload(data.path);
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const canonical = `https://docs.visp-stream.com${loaderData.url}`;
    return {
      meta: [
        { title: `${loaderData.title} | VISP-dokumentaatio` },
        { name: "description", content: loaderData.description },
        { property: "og:type", content: "article" },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: loaderData.description },
        { property: "og:url", content: canonical },
        { property: "og:locale", content: "fi_FI" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [
        { rel: "canonical", href: canonical },
        ...alternateLinks(loaderData.url),
      ],
    };
  },
  component: Page,
});

function Page() {
  return <LocalizedDocsPage data={Route.useLoaderData()} locale="fi" />;
}
