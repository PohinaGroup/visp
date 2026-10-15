import { describe, expect, test } from "bun:test";

import { finnishUi, landingHead, localizedHead, otherLocaleHref } from "./i18n";
import { studioStreamCopy } from "./studio-model";

describe("localizedHead", () => {
	test("keeps English canonical and pairs Finnish without duplicate locale prefixes", () => {
		expect(localizedHead("en", "/")[0]?.href).toBe("https://visp-stream.com/");
		expect(localizedHead("fi", "/fi")[0]?.href).toBe(
			"https://visp-stream.com/fi",
		);
		expect(localizedHead("fi", "/fi/contact")[0]?.href).toBe(
			"https://visp-stream.com/fi/contact",
		);
	});
});

describe("Finnish coverage", () => {
	test("every stream status string is translated", () => {
		const statuses = [
			"unknown",
			"idle",
			"camera-connected",
			"studio-starting",
			"overlays-active",
			"camera-only",
			"preview-failed",
		] as const;
		const missing = statuses
			.flatMap((status) => {
				const copy = studioStreamCopy(status);
				return [copy.title, copy.description];
			})
			.filter((english) => finnishUi[english] === undefined);
		expect(missing).toEqual([]);
	});

	test("the save rate-limit line keeps its placeholder in Finnish", () => {
		const english =
			"Changes weren't saved. Try again in {seconds} seconds. Your edits are still here.";
		expect(finnishUi[english]).toContain("{seconds}");
	});
});

test("otherLocaleHref", () => {
	expect(otherLocaleHref("/", "")).toBe("/fi");
	expect(otherLocaleHref("/fi", "")).toBe("/");
	expect(otherLocaleHref("/fi/privacy", "")).toBe("/privacy");
	expect(otherLocaleHref("/privacy", "")).toBe("/fi/privacy");
	expect(otherLocaleHref("/blog/some-post", "")).toBe("/fi/blog");
	expect(otherLocaleHref("/fi/blog/joku", "")).toBe("/blog");
	expect(otherLocaleHref("/dashboard", "")).toBe("/dashboard?lang=fi");
	expect(otherLocaleHref("/dashboard", "?lang=fi")).toBe("/dashboard");
	expect(otherLocaleHref("/device", "?user_code=AB&lang=fi")).toBe(
		"/device?user_code=AB",
	);
	expect(otherLocaleHref("/download", "?lang=fi")).toBe("/download");
	expect(otherLocaleHref("/privacy", "?lang=fi")).toBe("/privacy");
});

describe("landingHead", () => {
	test("canonical, hreflang, and og:url follow the page path", () => {
		const h = landingHead("fi", "/with-obs", "t", "d");
		expect(h.links[0]?.href).toBe("https://visp-stream.com/fi/with-obs");
		expect(h.links.find((l) => l.hrefLang === "en")?.href).toBe(
			"https://visp-stream.com/with-obs",
		);
		expect(h.meta.find((m) => m.property === "og:url")?.content).toBe(
			"https://visp-stream.com/fi/with-obs",
		);
	});

	test("emits one ld+json script per entry and none without", () => {
		expect(landingHead("en", "/", "t", "d").scripts).toEqual([]);
		const scripts = landingHead("en", "/", "t", "d", [
			{ "@type": "A" },
			{ "@type": "B" },
		]).scripts;
		expect(scripts.map((s) => s.type)).toEqual([
			"application/ld+json",
			"application/ld+json",
		]);
		expect(JSON.parse(scripts[1]?.children ?? "")).toEqual({ "@type": "B" });
	});
});

test("otherLocaleHref maps the new pages", () => {
	expect(otherLocaleHref("/phone-only", "")).toBe("/fi/phone-only");
	expect(otherLocaleHref("/fi/with-obs", "")).toBe("/with-obs");
});
