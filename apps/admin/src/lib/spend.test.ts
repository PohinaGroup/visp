import { expect, test } from "bun:test";
import {
	budgetBarWidth,
	budgetFeatureLabel,
	budgetPct,
	budgetTone,
	parseBudgetEur,
} from "./spend";

test("budget tone: green below 80 %, amber to 100 %, red above", () => {
	expect(budgetTone(10, 100, 10)).toBe("ok");
	expect(budgetTone(79.99, 100, 79.99)).toBe("ok");
	expect(budgetTone(80, 100, 80)).toBe("warn");
	expect(budgetTone(100, 100, 100)).toBe("warn");
	expect(budgetTone(100.01, 100, 100.01)).toBe("over");
});

test("budget tone without a ratio", () => {
	expect(budgetTone(null, 100, null)).toBe("none");
	expect(budgetTone(5, null, null)).toBe("none");
	// Spend over a 0 budget has no pct but is over.
	expect(budgetTone(5, 0, null)).toBe("over");
	expect(budgetTone(0, 0, 0)).toBe("ok");
});

test("bar width is capped and full when over", () => {
	expect(budgetBarWidth("ok", 42)).toBe(42);
	expect(budgetBarWidth("over", 250)).toBe(100);
	expect(budgetBarWidth("over", null)).toBe(100);
	expect(budgetBarWidth("none", null)).toBe(0);
});

test("parses EUR input to cents, rejecting anything else", () => {
	expect(parseBudgetEur("12")).toBe(12);
	expect(parseBudgetEur(" 12.5 ")).toBe(12.5);
	expect(parseBudgetEur("12,34")).toBe(12.34);
	expect(parseBudgetEur("0")).toBe(0);
	expect(parseBudgetEur("")).toBeNull();
	expect(parseBudgetEur("-1")).toBeNull();
	expect(parseBudgetEur("1.234")).toBeNull();
	expect(parseBudgetEur("1e3")).toBeNull();
	expect(parseBudgetEur("abc")).toBeNull();
});

test("feature labels", () => {
	expect(budgetFeatureLabel("all")).toBe("All hosted spend");
	expect(budgetFeatureLabel("encoder")).toBe("Relay encoder");
	expect(budgetFeatureLabel("other")).toBe("other");
});

test("budget pct matches the API rule", () => {
	expect(budgetPct(5, 10)).toBe(50);
	expect(budgetPct(null, 10)).toBeNull();
	expect(budgetPct(5, null)).toBeNull();
	expect(budgetPct(0, 0)).toBe(0);
	expect(budgetPct(1, 0)).toBeNull();
});
