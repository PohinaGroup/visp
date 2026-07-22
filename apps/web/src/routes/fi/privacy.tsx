import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalDoc } from "@/components/legal-doc";
import { localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/fi/privacy")({
	head: () => ({
		meta: [
			{ title: "Tietosuojaseloste — VISP" },
			{
				name: "description",
				content:
					"Miten VISP ja Pöhinä Group Oy keräävät, käyttävät ja suojaavat henkilötietojasi.",
			},
		],
		links: localizedHead("fi", "/fi/privacy"),
	}),
	component: PrivacyPage,
});

function PrivacyPage() {
	return (
		<LegalDoc
			eyebrow="Lakiasiat"
			title="Tietosuojaseloste"
			description="Tässä selosteessa kuvataan, miten VISP käsittelee henkilötietoja käyttäessäsi verkkosivustoa, hallintapaneelia, mobiilisovelluksia ja suoratoiston relay-palveluja."
			updated="19. heinäkuuta 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>1. Rekisterinpitäjä</h2>
				<p>
					Rekisterinpitäjä on <strong>{legalEntity.companyName}</strong>{" "}
					(Y-tunnus {legalEntity.businessId}),{" "}
					{legalEntity.addressLines.join(", ")}. Yhteys:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>2. Mikä VISP on</h2>
				<p>
					VISP on itse ylläpidettävä SRT/RTMP-relay ja etäsuoratoiston
					ohjauspalvelu. Lähetysavaimesi pysyvät sinulla eikä niitä lähetetä
					VISPille. VISP välittää suoraa mediaa ja tarjoaa siihen liittyvät
					tili-, hallintapaneeli- ja laitetoiminnot.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>3. Käsittelemämme tiedot</h2>
				<ul>
					<li>
						<strong>Tilitiedot</strong> Twitch- tai Kick-kirjautumisesta: nimi,
						sähköpostiosoite, profiilikuva ja yhdistetyn palvelutilin
						tunnisteet.
					</li>
					<li>
						<strong>Todennustiedot</strong>: turvallisesti tallennetut
						OAuth-käyttö- ja päivitystunnukset, istunnot, IP-osoite ja selaimen
						käyttäjäagentti.
					</li>
					<li>
						<strong>Palvelun määritykset</strong>: relay-julkaisupolut, nimet,
						tiivistetyt tai salatut julkaisusalaisuudet, natiiviasennusten
						tunnisteet ja käyttöönottoasetukset.
					</li>
					<li>
						<strong>Toimintamittaukset</strong>: tiliisi liittyvät yhteys- ja
						viivehavainnot (RTT).
					</li>
					<li>
						<strong>Hallintapaneelin tilannekuvat</strong>: yksi yksityinen,
						matalaresoluutioinen (noin 640 px) still-kuva aktiivista
						julkaisupolkua kohti, noin minuutin välein ja enintään noin
						vuorokauden ajan päivitysten päätyttyä.
					</li>
					<li>
						<strong>Chat-yhteyden metatiedot</strong>, kuten tilaustunnisteet.
						VISP ei säilytä chat-viestien sisältöä sisältöarkistona.
					</li>
					<li>
						<strong>Turvallisuus- ja palvelulokit</strong> luotettavuutta,
						väärinkäytösten estämistä ja virheiden selvittämistä varten.
					</li>
				</ul>
				<p>
					VISP ei käsittele maksukorttitietoja. Palvelu on tällä hetkellä
					maksuton beta eikä laskuta käyttäjiä.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>4. Tarkoitukset ja oikeusperusteet</h2>
				<ul>
					<li>
						<strong>Palvelun tarjoaminen</strong> (sopimus / sopimusta edeltävät
						toimet): tilin luominen, tunnistaminen, relay-määritykset ja
						hallintapaneeli.
					</li>
					<li>
						<strong>Turvallisuus ja eheys</strong> (oikeutettu etu): istuntojen
						suojaaminen, petosten ja väärinkäytösten torjunta sekä palvelun
						luotettavuus.
					</li>
					<li>
						<strong>Lakisääteiset velvoitteet</strong>, kun sovellettava laki
						edellyttää tietojen säilyttämistä tai luovuttamista.
					</li>
					<li>
						<strong>Tuoteanalytiikka</strong> (oikeutettu etu / sisäänrakennettu
						tietosuoja): evästeetön Rybbit-analytiikka, kun se on käytössä.
						Katso <Link to="/fi/cookies">evästekäytäntö</Link>.
					</li>
					<li>
						<strong>Valinnaiset evästeet</strong> (suostumus), jos niitä otetaan
						käyttöön.
					</li>
				</ul>
			</section>
			<section className="flex flex-col gap-3">
				<h2>5. Vastaanottajat ja käsittelijät</h2>
				<p>
					Käytämme VISPin toimintaan tarvittavia infrastruktuuripalveluja ja
					alikäsittelijöitä, kuten hostingia, tietokantaa, tilannekuvien
					objektitallennusta sekä Twitchiä ja Kickiä OAuth-tunnistukseen. Kun
					analytiikka on käytössä, käytämme Rybbit-palvelua evästeettömään
					tuoteanalytiikkaan. Tietoja jaetaan vain palvelun tarjoamisen
					edellyttämässä laajuudessa. Valitsemasi suoratoistokohteet saavat
					julkaisemasi median; VISP ei ota lähetysavaimiasi haltuunsa.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>6. Kansainväliset siirrot</h2>
				<p>
					Infrastruktuuri voi käsitellä tietoja EU-/ETA-alueella tai muissa
					maissa. ETA-alueen ulkopuolisissa siirroissa käytämme soveltuvin osin
					GDPR:n edellyttämiä suojatoimia, kuten vakiolausekkeita.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>7. Säilytysajat</h2>
				<ul>
					<li>
						Tili- ja määritystiedot säilytetään tilin ollessa aktiivinen ja
						poistetaan aktiivijärjestelmistä tilin poistamisen yhteydessä.
					</li>
					<li>
						Tilannekuvat korvataan lähetyksen aikana ja vanhenevat noin
						vuorokauden kuluessa päivitysten päätyttyä.
					</li>
					<li>
						Salatut varmuuskopiot ylikirjoitetaan enintään 30 päivän kuluessa
						poistosta.
					</li>
					<li>
						Turvallisuus- ja palvelulokeja säilytetään enintään 90 päivää, ellei
						laki vaadi pidempää aikaa.
					</li>
				</ul>
				<p>
					VISP ei säilytä jatkuvia lähetystallenteita tai chat-sisältöarkistoja.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>8. Oikeutesi</h2>
				<p>
					GDPR:n nojalla sinulla voi olla oikeus saada pääsy tietoihin, oikaista
					tai poistaa niitä, rajoittaa tai vastustaa käsittelyä sekä siirtää
					tiedot järjestelmästä toiseen soveltuvin osin. Voit peruuttaa
					suostumuksen, kun käsittely perustuu siihen. Käytä oikeuksiasi
					lähettämällä viesti osoitteeseen{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> tai
					käyttämällä{" "}
					<Link to="/request-delete" search={{ lang: "fi" }}>
						tilin poistamista
					</Link>
					.
				</p>
				<p>
					Voit tehdä valituksen{" "}
					<a
						href={legalEntity.supervisoryAuthority.url}
						rel="noreferrer"
						target="_blank"
					>
						{legalEntity.supervisoryAuthority.name}
					</a>{" "}
					tai muulle toimivaltaiselle valvontaviranomaiselle.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>9. Evästeet</h2>
				<p>
					Välttämättömiä evästeitä käytetään tunnistamiseen ja istuntojen
					turvallisuuteen. Valinnaisia evästeitä käytetään vain
					suostumuksellasi. Lisätiedot:{" "}
					<Link to="/fi/cookies">evästekäytäntö</Link>.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>10. Muutokset</h2>
				<p>
					Voimme päivittää selostetta palvelun tai lain muuttuessa. Sivun
					päivityspäivä muuttuu samalla. Olennaisista muutoksista voidaan
					ilmoittaa myös tuotteessa tai sähköpostitse.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>11. Yhteystiedot</h2>
				<p>
					Tietosuojakysymykset:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
					Yrityksen täydet tiedot: <Link to="/fi/contact">yhteystiedot</Link>.
				</p>
			</section>
		</LegalDoc>
	);
}
