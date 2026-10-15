import { expect, test } from "bun:test";

import { landingCopy } from "./landing-copy";

const all = (o: unknown): string[] =>
	typeof o === "string"
		? [o]
		: Array.isArray(o)
			? o.flatMap(all)
			: o && typeof o === "object"
				? Object.values(o).flatMap(all)
				: [];

// The rules below scan every string. A "claim" is a full sentence (ends with
// a period), so labels, feature names, beats, and questions are skipped.
const isSentence = (s: string) => /[.!]$/.test(s.trim());
const noComputer =
	/no computer|tietokonetta ei tarvita|ei tietokonetta|ilman tietokonetta/i;
const neverDropClaim =
	/BRB|highlight|clip|overlay|on air|never.drop|klip|kooste|grafiik|lähetyksessä|katkottom/i;
const overlayWord = /overlay|grafiik|päällys/i;
const highlightWord = /highlight|clip|klip|kooste/i;
// Sentences about the visitor's own OBS studio, not a VISP promise.
const ownObs =
	/\b(your|own) OBS\b|OBS you already run|OBS:ää?si\b|OBS:ssäsi|\bomat? OBS|pyörivään OBS|kotikonee/i;
const phoneOnlyPromise =
	/phone only|on air|VISP's server|its own server|pelkkä puhelin|pitää sinut lähetyksessä|pelkällä puhelimella|VISPin palvelim|omalla palvelimellaan/i;
const isVispPromise = (s: string) =>
	!ownObs.test(s) || phoneOnlyPromise.test(s);

for (const locale of ["en", "fi"] as const) {
	const c = landingCopy[locale];
	const text = all(c);

	test(`${locale}: no template tells`, () => {
		for (const s of text) {
			expect(s).not.toContain("→");
			expect(s).not.toContain("—");
			expect(s).not.toMatch(/\S · \S/);
			expect(s).not.toMatch(/seamless|unleash|revolutionary|game-changer/i);
		}
	});

	test(`${locale}: Cloud Studio always says beta`, () => {
		expect(c.phoneOnly.studio.beta.toLowerCase()).toContain("beta");
		expect(
			text
				.filter((s) => s.includes("Cloud Studio"))
				.every((s) => /beta/i.test(s)),
		).toBe(true);
	});

	test(`${locale}: chooser never asks "do you use OBS"`, () => {
		expect(c.home.chooser.title).not.toMatch(/use OBS|käytätkö OBS/i);
		expect(c.home.chooser.phone.badge).toBeTruthy();
	});

	test(`${locale}: stories ship empty`, () => expect(c.stories).toEqual([]));

	test(`${locale}: no "cannot combine" claim`, () => {
		expect(text.join(" ")).not.toMatch(
			/does not aggregate|ei kuitenkaan yhdistä/i,
		);
	});

	test(`${locale}: meta fits search results`, () => {
		for (const page of [c.home, c.phoneOnly, c.withObs]) {
			expect(page.meta.title.length).toBeLessThanOrEqual(60);
			expect(page.meta.description.length).toBeLessThanOrEqual(160);
		}
	});

	test(`${locale}: never-drop, BRB, highlight, and overlay claims say no computer needed`, () => {
		const claims = text.filter(
			(s) => isSentence(s) && neverDropClaim.test(s) && isVispPromise(s),
		);
		expect(claims.length).toBeGreaterThan(20);
		for (const s of claims) expect(s).toMatch(noComputer);
	});

	test(`${locale}: every overlay promise says (beta)`, () => {
		const promises = text.filter(
			(s) => isSentence(s) && overlayWord.test(s) && isVispPromise(s),
		);
		expect(promises.length).toBeGreaterThan(10);
		for (const s of promises) expect(s).toContain("(beta)");
	});

	test(`${locale}: every highlight or clip promise says Plus`, () => {
		const promises = text.filter(
			(s) => highlightWord.test(s) && !c.home.strip.beats.includes(s),
		);
		expect(promises.length).toBeGreaterThan(10);
		for (const s of promises) expect(s).toMatch(/Plus/);
	});

	test(`${locale}: price rows say free`, () => {
		for (const page of [c.phoneOnly, c.withObs]) {
			expect(page.cost.rows[0].cost).toBe(
				locale === "en" ? "Free" : "Ilmainen",
			);
			expect(page.cost.rows[1].cost).toBe(page.cost.rows[0].cost);
		}
		expect(text.join(" ")).not.toMatch(
			/Free to start|Aloittaminen on ilmaista/,
		);
	});

	test(`${locale}: strip beats each say what VISP does and name the feature`, () => {
		for (const d of c.home.strip.details) expect(d).toMatch(/ \([^)]+\)\.$/);
		expect(c.phoneOnly.strip).toEqual(c.home.strip);
	});

	test(`${locale}: every "more" line opens with a situation`, () => {
		for (const s of c.home.more) expect(s).toMatch(/^[^.?!]+\? \S/);
	});

	test(`${locale}: phone only splits its situations`, () => {
		expect(c.phoneOnly.situations).toHaveLength(3);
		expect(c.phoneOnly.more.items).toHaveLength(4);
		expect(c.withObs.situations).toHaveLength(4);
	});
}

test("en: home chooser and strip use the spec text", () => {
	const { home } = landingCopy.en;
	expect(home.chooser.title).toBe("Where do you want to make your show?");
	expect(home.chooser.phone.badge).toBe("Most creators");
	expect(home.strip.beats).toEqual([
		"Signal weakens on the highway",
		"Dead zone: viewers watch your clips",
		"Back in range: live again",
	]);
});

test("en: serial commas", () => {
	expect(all(landingCopy.en).join(" ")).not.toMatch(/Kick (and|or) YouTube/);
});

test("en: phone only answers the OBS question with no", () => {
	const item = landingCopy.en.phoneOnly.faq.items.find(
		(i) => i.q === "Do I need OBS for a BRB screen or overlays?",
	);
	expect(item?.a.startsWith("No.")).toBe(true);
});

test("en: Wi-Fi and cellular answer says the app can combine both", () => {
	const item = landingCopy.en.home.faq.items.find(
		(i) => i.q === "Can I use Wi-Fi and cellular at the same time?",
	);
	expect(item?.a).toMatch(/combine/);
	expect(item?.a).toMatch(/every packet over both/);
	expect(item?.a).toMatch(/Network bonding/);
});
