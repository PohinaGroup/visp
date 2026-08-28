import { describe, expect, test } from "bun:test";
import { nativeDirectText } from "./native-direct-i18n";

describe("native Direct portrait translations", () => {
	test("uses Finnish for both language and regional locale tags", () => {
		expect(nativeDirectText("Portrait", "fi")).toBe("Pysty");
		expect(nativeDirectText("Save framing", "fi-FI")).toBe("Tallenna rajaus");
		expect(
			nativeDirectText(
				"No free Direct slot for portrait. Landscape can still go live.",
				"fi-FI",
			),
		).toBe(
			"Pystylähdölle ei ole vapaata Direct-paikkaa. Vaakalähtö voi silti käynnistyä.",
		);
		expect(nativeDirectText("Authorize Kick streaming first", "fi-FI")).toBe(
			"Valtuuta Kick-suoratoisto ensin",
		);
		expect(
			nativeDirectText("kick is already a landscape destination", "fi-FI"),
		).toBe("Kick on jo vaakalähtö");
		expect(nativeDirectText("Custom output could not be saved", "fi-FI")).toBe(
			"Mukautettua lähtöä ei voitu tallentaa",
		);
		expect(
			nativeDirectText(
				"Stop the publishing device before changing portrait framing",
				"fi-FI",
			),
		).toBe("Pysäytä julkaisulaite ennen pystyrajauksen muuttamista");
	});

	test("keeps English and unknown server errors unchanged", () => {
		expect(nativeDirectText("Portrait", "en-US")).toBe("Portrait");
		expect(nativeDirectText("Provider unavailable", "fi-FI")).toBe(
			"Provider unavailable",
		);
	});
});
