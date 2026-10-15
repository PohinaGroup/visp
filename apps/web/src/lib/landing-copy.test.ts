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

const noComputer = /no computer|tietokonetta ei tarvita|ei tietokonetta/i;
const neverDropFeature =
	/never drop|highlights|cloud studio|älä koskaan|koosteet/i;
const overlayWord = /overlay|grafiik/i;

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

	test(`${locale}: never-drop and overlay claims say no computer needed`, () => {
		const signalFaq = c.phoneOnly.faq.items
			.concat(c.home.faq.items)
			.filter((i) => /signal drops|yhteys katkeaa/i.test(i.q));
		expect(signalFaq.length).toBeGreaterThan(0);
		const claims = [
			c.home.stripNote,
			c.home.strip.details[1],
			c.home.strip.details[2],
			...c.home.noObs.items
				.filter((i) => neverDropFeature.test(i.feature))
				.map((i) => i.situation),
			...c.phoneOnly.situations
				.filter((s) => neverDropFeature.test(s.feature))
				.map((s) => s.body),
			c.phoneOnly.studio.body,
			...c.phoneOnly.versus.rows
				.filter((r) =>
					/air|highlight|overlay|lähetyksessä|klip|grafiik/i.test(r.label),
				)
				.map((r) => r.phone),
			c.withObs.noPcNote.text,
			...signalFaq.map((i) => i.a),
		];
		expect(claims.length).toBeGreaterThan(10);
		for (const s of claims) expect(s).toMatch(noComputer);
	});

	test(`${locale}: every overlay promise says (beta)`, () => {
		const promises = [
			c.home.meta.description,
			c.home.hero.body,
			...c.home.noObs.items.map((i) => i.situation),
			c.phoneOnly.meta.description,
			c.phoneOnly.hero.body,
			c.phoneOnly.studio.body,
			c.phoneOnly.cost.body,
			...c.phoneOnly.versus.rows.map((r) => r.phone),
			c.withObs.meta.description,
			c.withObs.noPcNote.text,
			c.withObs.cost.body,
			...[c.home.faq, c.phoneOnly.faq, c.withObs.faq].flatMap((f) =>
				f.items.map((i) => i.a),
			),
		].filter((s) => overlayWord.test(s));
		expect(promises.length).toBeGreaterThan(5);
		for (const s of promises) expect(s).toContain("(beta)");
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
