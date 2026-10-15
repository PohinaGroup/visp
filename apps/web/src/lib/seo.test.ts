import { expect, test } from "bun:test";

import { faqJsonLd, howToJsonLd, softwareAppJsonLd } from "./seo";

test("howTo lists steps in order", () => {
	const j = howToJsonLd("en", "Go live", [
		{ title: "A", body: "a" },
		{ title: "B", body: "b" },
	]);
	expect(j["@type"]).toBe("HowTo");
	expect(j.name).toBe("Go live");
	expect(j.step.map((s) => s.position)).toEqual([1, 2]);
	expect(j.step[1]).toEqual({
		"@type": "HowToStep",
		position: 2,
		name: "B",
		text: "b",
	});
});

test("faq json-ld shape", () => {
	const j = faqJsonLd("fi", [{ q: "Q", a: "A" }]);
	expect(j["@type"]).toBe("FAQPage");
	expect(j.inLanguage).toBe("fi");
	expect(j.mainEntity[0]?.name).toBe("Q");
	expect(j.mainEntity[0]?.acceptedAnswer.text).toBe("A");
});

test("software application is free on iOS and Android, per locale", () => {
	const j = softwareAppJsonLd("fi");
	expect(j["@type"]).toBe("SoftwareApplication");
	expect(j.applicationCategory).toBe("MultimediaApplication");
	expect(j.operatingSystem).toBe("iOS, Android");
	expect(j.offers).toEqual({
		"@type": "Offer",
		price: "0",
		priceCurrency: "USD",
	});
	expect(j.url).toBe("https://visp-stream.com/fi");
	expect(softwareAppJsonLd("en").url).toBe("https://visp-stream.com/");
});
