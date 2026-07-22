import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { staticFunctionMiddleware } from "@tanstack/start-static-server-functions";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
} from "fumadocs-ui/layouts/docs/page";
import { Suspense } from "react";

import { getMDXComponents } from "@/components/mdx";
import { alternateLinks } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { docsSiteUrl } from "@/lib/shared";
import { slugsToMarkdownPath, source } from "@/lib/source";

export const loadDocsPage = createServerFn({
  method: "GET",
})
  .validator((data: { locale: "en" | "fi"; slugs: string[] }) => data)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data: { locale, slugs } }) => {
    const page = source.getPage(slugs, locale);
    if (!page) throw notFound();

    return {
      path: page.path,
      title: page.data.title,
      description: page.data.description,
      url: page.url,
      markdownUrl: slugsToMarkdownPath(page.slugs).url,
      pageTree: await source.serializePageTree(source.getPageTree(locale)),
    };
  });

export const Route = createFileRoute("/docs/$")({
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/") ?? [];
    const data = await loadDocsPage({ data: { locale: "en", slugs } });
    await clientLoader.preload(data.path);
    return data;
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const canonical = `${docsSiteUrl}${loaderData.url}`;
    return {
      meta: [
        { title: `${loaderData.title} | VISP Documentation` },
        { name: "description", content: loaderData.description },
        { property: "og:type", content: "article" },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: loaderData.description },
        { property: "og:url", content: canonical },
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

export const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    { markdownUrl }: { markdownUrl: string },
  ) {
    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <div className="flex flex-row gap-2 items-center border-b -mt-4 pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
        </div>
        <DocsBody>
          <MDX components={getMDXComponents()} />
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  return <LocalizedDocsPage data={Route.useLoaderData()} locale="en" />;
}

export function LocalizedDocsPage({
  data,
  locale,
}: {
  data: Awaited<ReturnType<typeof loadDocsPage>>;
  locale: "en" | "fi";
}) {
  const { pageTree, path, markdownUrl } = useFumadocsLoader(data);

  return (
    <DocsLayout {...baseOptions(locale)} tree={pageTree}>
      <Link to={markdownUrl} hidden />
      <Suspense>{clientLoader.useContent(path, { markdownUrl })}</Suspense>
    </DocsLayout>
  );
}
