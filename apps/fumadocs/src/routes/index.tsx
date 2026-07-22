import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { alternateLinks } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { docsSiteUrl } from "@/lib/shared";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VISP Relay Documentation" },
      {
        name: "description",
        content:
          "Set up VISP remote cameras, phone publishing, OBS control, SRT fallback, and self-hosting.",
      },
    ],
    links: [
      { rel: "canonical", href: `${docsSiteUrl}/` },
      ...alternateLinks("/"),
    ],
  }),
  component: Home,
});

function DocsLink({ children, page }: { children: string; page: string }) {
  return (
    <Link
      className="rounded-lg bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground text-sm"
      params={{ _splat: page }}
      to="/docs/$"
    >
      {children}
    </Link>
  );
}

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-6 py-20">
        <div className="max-w-3xl space-y-5">
          <p className="font-medium text-fd-muted-foreground text-sm uppercase tracking-wider">
            Streamer documentation
          </p>
          <h1 className="font-semibold text-4xl tracking-tight sm:text-6xl">
            Your phone is the camera. OBS stays the studio.
          </h1>
          <p className="max-w-2xl text-fd-muted-foreground text-lg">
            Sign in with Twitch or Kick, import a ready-made OBS scene
            collection, go live from a phone or browser, and control scenes
            remotely — without handing VISP your stream key.
          </p>
          <div className="flex flex-wrap gap-3">
            <DocsLink page="get-started">Get started</DocsLink>
            <DocsLink page="self-hosting">Self-host</DocsLink>
            <DocsLink page="development">Develop VISP</DocsLink>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [
              "Phone to OBS",
              "Publish from iOS, Android, or the browser into your home studio.",
            ],
            [
              "Keep your show",
              "Scenes, alerts, and graphics stay in the OBS setup you already built.",
            ],
            [
              "Remote control",
              "Pair the OBS plugin to start, stop, and switch scenes from your phone.",
            ],
          ].map(([title, description]) => (
            <section className="rounded-xl border bg-fd-card p-5" key={title}>
              <h2 className="font-medium">{title}</h2>
              <p className="mt-2 text-fd-muted-foreground text-sm">
                {description}
              </p>
            </section>
          ))}
        </div>
      </main>
    </HomeLayout>
  );
}
