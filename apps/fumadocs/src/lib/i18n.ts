import { defineI18n } from "fumadocs-core/i18n";
import { defineI18nUI } from "fumadocs-ui/i18n";

export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: ["en", "fi"],
  hideLocale: "default-locale",
});

export type Locale = (typeof i18n.languages)[number];

export const i18nUI = defineI18nUI(i18n, {
  en: { displayName: "English" },
  fi: {
    displayName: "Suomi",
    "Choose a language(language switcher)": "Valitse kieli",
    "Choose a language(language switcher)(aria-label)": "Valitse kieli",
    "Close Search(search dialog)(aria-label)": "Sulje haku",
    "Close Sidebar(sidebar)(aria-label)": "Sulje sivupalkki",
    "Copy Markdown(page actions)": "Kopioi Markdown",
    "Next Page(pagination)": "Seuraava sivu",
    "No Headings(table of contents)": "Ei otsikoita",
    "No results found(search dialog)": "Ei hakutuloksia",
    "On this page(table of contents)": "Tällä sivulla",
    "Open Search(search trigger)(aria-label)": "Avaa haku",
    "Open Sidebar(sidebar)(aria-label)": "Avaa sivupalkki",
    "Previous Page(pagination)": "Edellinen sivu",
    "Search(search dialog)": "Haku",
    "Search(search trigger)": "Hae dokumentaatiosta",
    "Table of Contents(inline table of contents)": "Sisällys",
    "Toggle Menu(home layout header)(aria-label)": "Avaa tai sulje valikko",
    "View as Markdown(page actions)": "Näytä Markdownina",
  },
});

export function alternateLinks(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const englishPath = normalized.replace(/^\/fi(?=\/|$)/, "") || "/";
  const finnishPath = englishPath === "/" ? "/fi" : `/fi${englishPath}`;
  return [
    {
      rel: "alternate",
      hreflang: "en",
      href: `https://docs.visp-stream.com${englishPath}`,
    },
    {
      rel: "alternate",
      hreflang: "fi",
      href: `https://docs.visp-stream.com${finnishPath}`,
    },
    {
      rel: "alternate",
      hreflang: "x-default",
      href: `https://docs.visp-stream.com${englishPath}`,
    },
  ];
}
