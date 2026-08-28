import { expect, test } from "bun:test";
import {
	emptySavedStudioNeedsWarning,
	emptyStudioNeedsWarning,
	emptyStudioWarningDecision,
	studioEditUrl,
} from "./studio-link";

test("native opens the authenticated web Studio editor", () => {
	expect(studioEditUrl("https://visp.example/", "fi")).toBe(
		"https://visp.example/studio?lang=fi",
	);
});

test("warns only for an empty cloud program that was not dismissed", () => {
	expect(emptyStudioNeedsWarning("cloud_studio", 0, false)).toBe(true);
	expect(emptyStudioNeedsWarning("obs", 0, false)).toBe(false);
	expect(emptyStudioNeedsWarning("cloud_studio", 1, false)).toBe(false);
	expect(emptyStudioNeedsWarning("cloud_studio", 0, true)).toBe(false);
});

test("empty Studio offers continue, persistently dismiss, and cancel", () => {
	expect(emptyStudioWarningDecision("continue")).toEqual({
		continue: true,
		dismiss: false,
	});
	expect(emptyStudioWarningDecision("dismiss")).toEqual({
		continue: true,
		dismiss: true,
	});
	expect(emptyStudioWarningDecision("cancel")).toEqual({
		continue: false,
		dismiss: false,
	});
});

test("Go Live decides from the saved graph, not an unsaved draft", () => {
	const saved = { scenes: [{ layers: [] }] };
	const draft = { scenes: [{ layers: [{}] }] };
	expect(emptySavedStudioNeedsWarning("cloud_studio", saved, false)).toBe(true);
	expect(draft.scenes[0]?.layers).toHaveLength(1);
	expect(emptySavedStudioNeedsWarning("cloud_studio", draft, false)).toBe(
		false,
	);
	expect(emptySavedStudioNeedsWarning("cloud_studio", saved, true)).toBe(false);
});
