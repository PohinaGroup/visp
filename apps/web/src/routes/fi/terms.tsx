import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalDoc } from "@/components/legal-doc";
import { localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/fi/terms")({
	head: () => ({
		meta: [
			{ title: "Käyttöehdot — VISP" },
			{
				name: "description",
				content: "Pöhinä Group Oy:n ylläpitämän VISP-palvelun käyttöehdot.",
			},
		],
		links: localizedHead("fi", "/fi/terms"),
	}),
	component: TermsPage,
});

function TermsPage() {
	return (
		<LegalDoc
			eyebrow="Lakiasiat"
			title="Käyttöehdot"
			description="Nämä ehdot koskevat VISPin verkkosivuston, hallintapaneelin, sovellusten ja suoratoiston relay-palvelujen käyttöä."
			updated="19. heinäkuuta 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>1. Palveluntarjoaja</h2>
				<p>
					VISPiä ylläpitää <strong>{legalEntity.companyName}</strong> (Y-tunnus{" "}
					{legalEntity.businessId}), {legalEntity.addressLines.join(", ")}{" "}
					(”me”). Yhteydenotot:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>2. Palvelu</h2>
				<p>
					VISP tarjoaa työkaluja suorien SRT/RTMP-lähetysten välittämiseen ja
					etätuotannon ohjaukseen. Palvelu on beta-vaiheessa ja voi muuttua,
					olla rajoitettu tai keskeytyä ilman ennakkoilmoitusta. Ellemme ilmoita
					muuta, betan käyttö on maksutonta eikä vaadi maksukorttia.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>3. Käyttökelpoisuus ja tilit</h2>
				<p>
					Sinun on voitava tehdä sitova sopimus ja noudatettava Twitchin, Kickin
					sekä muiden lähetykseesi sovellettavien palvelujen sääntöjä. Vastaat
					VISP-tililläsi tapahtuvasta toiminnasta sekä tunnusten ja laitteiden
					turvallisuudesta. Kirjautuminen käyttää Twitchin ja/tai Kickin
					OAuthia.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>4. Hyväksyttävä käyttö</h2>
				<p>Sitoudut olemaan:</p>
				<ul>
					<li>
						käyttämättä VISPiä lainvastaiseen, vahingolliseen tai oikeuksia
						loukkaavaan sisältöön;
					</li>
					<li>
						häiritsemättä, tutkimatta luvatta tai ylikuormittamatta palvelua;
					</li>
					<li>
						kiertämättä käyttörajoituksia tai takaisinmallintamatta palvelua
						muutoin kuin lain sallimissa rajoissa;
					</li>
					<li>
						esiintymättä toisena henkilönä tai häiritsemättä muiden käyttäjien
						lähetyksiä tai tilejä;
					</li>
					<li>
						käyttämättä VISPiä tavalla, joka rikkoo lähetykseen sovellettavia
						palvelu-, tekijänoikeus- tai tietosuojasääntöjä.
					</li>
				</ul>
				<p>
					Vastaat yksin lähetyksesi sisällöstä, kohteista ja kolmansien
					osapuolten ehtojen noudattamisesta.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>5. Lähetysavaimet ja media</h2>
				<p>
					Lähetysavaimia ei ole tarkoitettu ladattavaksi VISPiin. Suora media
					välitetään määrittämälläsi tavalla. VISP voi tallentaa lyhytikäisiä
					yksityisiä hallintapaneelin tilannekuvia{" "}
					<Link to="/fi/privacy">tietosuojaselosteessa</Link> kuvatulla tavalla.
					Palvelu ei tarjoa jatkuvien tallenteiden säilytystä.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>6. Immateriaalioikeudet ja avoin lähdekoodi</h2>
				<p>
					VISP on avointa lähdekoodia {legalEntity.license}-lisenssillä.
					Lähdekoodi on osoitteessa{" "}
					<a href={legalEntity.sourceUrl} rel="noreferrer" target="_blank">
						{legalEntity.sourceUrl}
					</a>
					. Lisenssi koskee sen alaista koodia, ja kolmansien osapuolten osilla
					on omat ilmoituksensa. VISP-brändi ja sivuston aineisto kuuluvat
					meille tai lisenssinantajillemme, ellei toisin ilmoiteta. Oma
					sisältösi säilyy sinun omistuksessasi.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>7. Betaa koskeva vastuuvapaus</h2>
				<p>
					PALVELU TARJOTAAN ”SELLAISENA KUIN SE ON” JA ”SAATAVUUDEN MUKAAN”.
					Lain sallimassa laajuudessa emme anna takuita kaupallisesta
					hyödynnettävyydestä, tiettyyn tarkoitukseen sopivuudesta tai
					oikeuksien loukkaamattomuudesta. Emme takaa keskeytyksetöntä,
					virheetöntä tai viiveetöntä suoratoistoa.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>8. Vastuunrajoitus</h2>
				<p>
					Suomen ja EU:n lain sallimassa laajuudessa emme vastaa välillisistä,
					satunnaisista, erityisistä tai seurannaisvahingoista, menetetystä
					voitosta taikka menetetyistä lähetyksistä, yleisöistä tai tuloista.
					Mikään näissä ehdoissa ei rajoita vastuuta, jota pakottavan lain
					mukaan ei voida rajoittaa, kuten vastuuta huolimattomuudella
					aiheutetusta kuolemasta tai henkilövahingosta taikka petoksesta.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>9. Käytön keskeyttäminen ja päättäminen</h2>
				<p>
					Voimme keskeyttää tai päättää käyttöoikeuden väärinkäytön,
					oikeudellisen riskin tai palvelun eheyden vaarantumisen vuoksi. Voit
					lopettaa VISPin käytön ja poistaa tilisi milloin tahansa{" "}
					<Link to="/request-delete" search={{ lang: "fi" }}>
						tilin poistotoiminnolla
					</Link>
					.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>10. Tietosuoja</h2>
				<p>
					Henkilötietoja käsitellään{" "}
					<Link to="/fi/privacy">tietosuojaselosteen</Link> ja{" "}
					<Link to="/fi/cookies">evästekäytännön</Link> mukaisesti.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>11. Muutokset</h2>
				<p>
					Voimme päivittää näitä ehtoja. Käytön jatkaminen uuden päivityspäivän
					jälkeen merkitsee muutettujen ehtojen hyväksymistä, ellei pakottavasta
					laista muuta johdu.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>12. Sovellettava laki</h2>
				<p>
					Näihin ehtoihin sovelletaan {legalEntity.governingLaw} lakia
					lainvalintasäännöistä riippumatta. Suomen tuomioistuimilla on
					toimivalta, jollei asuinmaassasi sovellettavista pakottavista
					kuluttajansuojasäännöistä muuta johdu.
				</p>
			</section>
			<section className="flex flex-col gap-3">
				<h2>13. Yhteystiedot</h2>
				<p>
					Kysymykset:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>. Katso
					myös <Link to="/fi/contact">yhteystiedot</Link>.
				</p>
			</section>
		</LegalDoc>
	);
}
