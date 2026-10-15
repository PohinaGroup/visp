// Structured data for the landing pages, one object per schema.org type.
// `landingHead` turns each into an ld+json script.
import { type Locale, localizedHead } from "./i18n";

export type FaqJsonLd = {
	"@context": "https://schema.org";
	"@type": "FAQPage";
	inLanguage: Locale;
	mainEntity: {
		"@type": "Question";
		name: string;
		acceptedAnswer: { "@type": "Answer"; text: string };
	}[];
};

export type HowToJsonLd = {
	"@context": "https://schema.org";
	"@type": "HowTo";
	name: string;
	inLanguage: Locale;
	step: {
		"@type": "HowToStep";
		position: number;
		name: string;
		text: string;
	}[];
};

export type SoftwareAppJsonLd = {
	"@context": "https://schema.org";
	"@type": "SoftwareApplication";
	name: "VISP";
	applicationCategory: "MultimediaApplication";
	operatingSystem: "iOS, Android";
	inLanguage: Locale;
	offers: { "@type": "Offer"; price: "0"; priceCurrency: "USD" };
	url: string;
};

export function faqJsonLd(
	locale: Locale,
	items: readonly { q: string; a: string }[],
): FaqJsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		inLanguage: locale,
		mainEntity: items.map((item) => ({
			"@type": "Question",
			name: item.q,
			acceptedAnswer: { "@type": "Answer", text: item.a },
		})),
	};
}

export function howToJsonLd(
	locale: Locale,
	name: string,
	steps: readonly { title: string; body: string }[],
): HowToJsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "HowTo",
		name,
		inLanguage: locale,
		step: steps.map((step, index) => ({
			"@type": "HowToStep",
			position: index + 1,
			name: step.title,
			text: step.body,
		})),
	};
}

export function softwareAppJsonLd(locale: Locale): SoftwareAppJsonLd {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: "VISP",
		applicationCategory: "MultimediaApplication",
		operatingSystem: "iOS, Android",
		inLanguage: locale,
		offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
		// The canonical home URL for the locale.
		url: localizedHead(locale)[0]?.href ?? "",
	};
}
