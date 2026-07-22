import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import { alternateLinks } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";

export const Route = createFileRoute("/fi/")({
  head: () => ({
    meta: [
      { title: "VISP-dokumentaatio" },
      {
        name: "description",
        content:
          "Ohjeet VISP-etäkameroiden, puhelinjulkaisun, OBS-ohjauksen, SRT-varayhteyden ja itse ylläpidon käyttöönottoon.",
      },
      { property: "og:locale", content: "fi_FI" },
    ],
    links: [
      { rel: "canonical", href: "https://docs.visp-stream.com/fi" },
      ...alternateLinks("/fi"),
    ],
  }),
  component: Home,
});

function DocsLink({ children, page }: { children: string; page: string }) {
  return (
    <Link
      className="rounded-lg bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground text-sm"
      params={{ _splat: page }}
      to="/fi/docs/$"
    >
      {children}
    </Link>
  );
}

function Home() {
  return (
    <HomeLayout {...baseOptions("fi")}>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-10 px-6 py-20">
        <div className="max-w-3xl space-y-5">
          <p className="font-medium text-fd-muted-foreground text-sm uppercase tracking-wider">
            Suoratoistajan dokumentaatio
          </p>
          <h1 className="font-semibold text-4xl tracking-tight sm:text-6xl">
            Puhelimesi on kamera. OBS pysyy studiona.
          </h1>
          <p className="max-w-2xl text-fd-muted-foreground text-lg">
            Kirjaudu Twitchillä tai Kickillä, tuo valmis OBS-kohtauskokoelma,
            aloita lähetys puhelimesta tai selaimesta ja ohjaa kohtauksia etänä
            — antamatta lähetysavaintasi VISPille.
          </p>
          <div className="flex flex-wrap gap-3">
            <DocsLink page="get-started">Aloita tästä</DocsLink>
            <DocsLink page="self-hosting">Ylläpidä itse</DocsLink>
            <DocsLink page="development">Kehitä VISPiä</DocsLink>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [
              "Puhelimesta OBS:ään",
              "Julkaise iOS:stä, Androidista tai selaimesta kotistudioosi.",
            ],
            [
              "Säilytä tuotantosi",
              "Kohtaukset, hälytykset ja grafiikat pysyvät nykyisessä OBS-kokoonpanossasi.",
            ],
            [
              "Etäohjaus",
              "Yhdistä OBS-lisäosa ja käynnistä, pysäytä tai vaihda kohtauksia puhelimesta.",
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
