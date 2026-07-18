import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/")({
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
            SRT and RTMP relay
          </p>
          <h1 className="font-semibold text-4xl tracking-tight sm:text-6xl">
            Stream from anywhere. Switch scenes in OBS.
          </h1>
          <p className="max-w-2xl text-fd-muted-foreground text-lg">
            VISP gives Twitch streamers private publish and read credentials,
            latency guidance, managed relay paths, and a ready-to-import OBS
            scene collection.
          </p>
          <div className="flex flex-wrap gap-3">
            <DocsLink page="">Read the overview</DocsLink>
            <DocsLink page="broadcaster-setup">Set up a stream</DocsLink>
            <DocsLink page="development">Develop VISP</DocsLink>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [
              "Twitch login",
              "No email/password accounts or Twitch stream keys.",
            ],
            [
              "One-time secrets",
              "Relay passwords are revealed once and stored as hashes.",
            ],
            ["SRT first", "RTMP remains available when a network blocks UDP."],
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
