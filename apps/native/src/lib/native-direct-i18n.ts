const FINNISH: Record<string, string> = {
	Portrait: "Pysty",
	Configured: "Määritetty",
	"Edit framing": "Muokkaa rajausta",
	Remove: "Poista",
	"Add portrait": "Lisää pystylähtö",
	"Frame portrait output": "Rajaa pystylähtö",
	"Landscape contribution preview with movable portrait crop":
		"Vaakasyötteen esikatselu ja siirrettävä pystyrajaus",
	"Move portrait crop": "Siirrä pystyrajausta",
	"Resize portrait crop": "Muuta pystyrajauksen kokoa",
	"Simulated portrait output": "Pystylähdön esikatselu",
	"Preview appears while this device is publishing":
		"Esikatselu näkyy, kun tämä laite julkaisee",
	"Horizontal position": "Vaakasijainti",
	"Horizontal crop position": "Rajauksen vaakasijainti",
	"Vertical position": "Pystysijainti",
	"Vertical crop position": "Rajauksen pystysijainti",
	"Crop size": "Rajauksen koko",
	"Portrait crop size": "Pystyrajauksen koko",
	Cancel: "Peruuta",
	"Save framing": "Tallenna rajaus",
	"Could not save framing. Check your connection and retry.":
		"Rajauksen tallennus epäonnistui. Tarkista yhteys ja yritä uudelleen.",
	"Portrait will start when a Direct slot is free":
		"Pystylähtö käynnistyy, kun Direct-paikka vapautuu",
	"Portrait output could not be saved": "Pystylähtöä ei voitu tallentaa",
	"Portrait output is unavailable": "Pystylähtö ei ole käytettävissä",
	"Portrait destination not found": "Pystylähtöä ei löytynyt",
	"Portrait framing saved": "Pystyrajaus tallennettu",
	"No free Direct slot for portrait. Landscape can still go live.":
		"Pystylähdölle ei ole vapaata Direct-paikkaa. Vaakalähtö voi silti käynnistyä.",
	"Portrait framing is required": "Pystyrajaus vaaditaan",
	"Could not start portrait": "Pystylähtöä ei voitu käynnistää",
	"Direct reservation expired, reconnect the publisher":
		"Direct-varaus vanheni. Yhdistä julkaisulaite uudelleen",
	"Crop must stay within the source frame":
		"Rajauksen on pysyttävä lähdekuvan sisällä",
	"Crop must match its target aspect":
		"Rajauksen on vastattava kohteen kuvasuhdetta",
	starting: "käynnistyy",
	live: "suorana",
	retrying: "yrittää uudelleen",
	brb: "taukokortti",
	failed: "epäonnistui",
	stopped: "pysäytetty",
	stopping: "pysäytetään",
};

export function nativeDirectText(
	value: string,
	locale = Intl.DateTimeFormat().resolvedOptions().locale,
) {
	if (!locale.toLowerCase().startsWith("fi")) return value;
	const translated = FINNISH[value];
	if (translated) return translated;
	const authorize = /^Authorize (Twitch|Kick|YouTube) streaming first$/.exec(
		value,
	);
	if (authorize) return `Valtuuta ${authorize[1]}-suoratoisto ensin`;
	const link = /^Link (Twitch|Kick|YouTube) first$/.exec(value);
	if (link) return `Yhdistä ${link[1]} ensin`;
	const landscape =
		/^(twitch|kick|youtube) is already a landscape destination$/.exec(value);
	if (landscape) {
		const provider =
			landscape[1] === "twitch"
				? "Twitch"
				: landscape[1] === "kick"
					? "Kick"
					: "YouTube";
		return `${provider} on jo vaakalähtö`;
	}
	return value;
}
