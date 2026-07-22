import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { i18n } from "./i18n";
import { appName } from "./shared";

export function baseOptions(locale: "en" | "fi" = "en"): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    i18n,
    links: [
      {
        text: locale === "fi" ? "Blogi" : "Blog",
        url:
          locale === "fi"
            ? "https://visp-stream.com/fi/blog"
            : "https://visp-stream.com/blog",
      },
    ],
  };
}
