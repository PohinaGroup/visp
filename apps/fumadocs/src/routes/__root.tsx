import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { RootProvider } from "fumadocs-ui/provider/tanstack";

import SearchDialog from "@/components/search";
import { i18nUI } from "@/lib/i18n";

import appCss from "@/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "VISP Relay Documentation",
      },
      {
        name: "description",
        content:
          "Broadcaster and operator documentation for the VISP SRT relay.",
      },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate();
  const locale =
    pathname === "/fi" || pathname.startsWith("/fi/") ? "fi" : "en";
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          i18n={{
            ...i18nUI.provider(locale),
            onLocaleChange: (nextLocale) => {
              const englishPath = pathname.replace(/^\/fi(?=\/|$)/, "") || "/";
              const nextPath =
                nextLocale === "fi"
                  ? englishPath === "/"
                    ? "/fi"
                    : `/fi${englishPath}`
                  : englishPath;
              navigate({ href: nextPath });
            },
          }}
          search={{ SearchDialog }}
        >
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
