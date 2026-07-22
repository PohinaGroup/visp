import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalDoc } from "@/components/legal-doc";
import { localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/fi/contact")({
	head: () => ({
		meta: [
			{ title: "Yhteystiedot — VISP" },
			{
				name: "description",
				content: "VISPin taustalla olevan Pöhinä Group Oy:n yhteystiedot.",
			},
		],
		links: localizedHead("fi", "/fi/contact"),
	}),
	component: ContactPage,
});

function ContactPage() {
	return (
		<LegalDoc
			eyebrow="Lakiasiat"
			title="Yhteystiedot"
			description="Yrityksen tiedot ja yhteydenotto VISP-tiimiin."
			updated="19. heinäkuuta 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>Yritys</h2>
				<p>
					<strong>{legalEntity.companyName}</strong>
					<br />
					Y-tunnus: {legalEntity.businessId}
					<br />
					{legalEntity.addressLines.map((line) => (
						<span key={line}>
							{line}
							<br />
						</span>
					))}
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>Sähköposti</h2>
				<p>
					Yleiset asiat, tietosuoja ja tuki:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>
				</p>
				<p>
					Jos et voi kirjautua sisään ja haluat poistaa tilisi, lähetä samaan
					osoitteeseen viesti aiheella ”VISP-tilin poistaminen” sekä Twitch- tai
					Kick-käyttäjänimesi. Kirjautuneena voit käyttää myös{" "}
					<Link to="/request-delete" search={{ lang: "fi" }}>
						tilin poistosivua
					</Link>
					.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>Avoin lähdekoodi</h2>
				<p>
					VISP on julkaistu {legalEntity.license}-lisenssillä. Lähdekoodi on
					osoitteessa{" "}
					<a href={legalEntity.sourceUrl} rel="noreferrer" target="_blank">
						{legalEntity.sourceUrl}
					</a>
					.
				</p>
				<p>
					OBS-lisäosa on julkisessa betassa. Lataa julkaisut osoitteesta{" "}
					<a href={legalEntity.releasesUrl} rel="noreferrer" target="_blank">
						{legalEntity.releasesUrl}
					</a>
					.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>Tuotelinkit</h2>
				<ul>
					<li>
						<Link to="/download" search={{ lang: "fi" }}>
							Lataus ja beta
						</Link>
					</li>
					<li>
						<a
							href={`${legalEntity.docsUrl}/fi`}
							rel="noreferrer"
							target="_blank"
						>
							Dokumentaatio
						</a>
					</li>
					<li>
						<a href={legalEntity.sourceUrl} rel="noreferrer" target="_blank">
							GitHub
						</a>
					</li>
				</ul>
			</section>
			<section className="flex flex-col gap-3">
				<h2>Oikeudelliset asiakirjat</h2>
				<ul>
					<li>
						<Link to="/fi/privacy">Tietosuojaseloste</Link>
					</li>
					<li>
						<Link to="/fi/terms">Käyttöehdot</Link>
					</li>
					<li>
						<Link to="/fi/cookies">Evästekäytäntö</Link>
					</li>
				</ul>
			</section>
		</LegalDoc>
	);
}
