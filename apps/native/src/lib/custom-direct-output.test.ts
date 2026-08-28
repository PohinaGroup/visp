import { describe, expect, test } from "bun:test";
import {
	customOutputChangesDisabled,
	customOutputStatus,
	customOutputsForPath,
} from "./custom-direct-output";

const outputs = [
	{
		id: "landscape",
		destinationId: "destination",
		pathId: 7,
		role: "landscape" as const,
		state: "live",
		error: null,
	},
	{
		id: "portrait",
		destinationId: "destination",
		pathId: 7,
		role: "portrait" as const,
		state: "failed",
		error: "No free Direct slot",
	},
];

describe("native custom Direct output projection", () => {
	test("projects role-specific assignment and sanitized status", () => {
		const projected = customOutputsForPath(outputs, "destination", 7);
		expect(projected.landscape?.id).toBe("landscape");
		expect(projected.portrait?.id).toBe("portrait");
		expect(customOutputStatus(projected.portrait)).toBe("No free Direct slot");
	});

	test("disables output changes while live or mutating", () => {
		expect(customOutputChangesDisabled(true, false)).toBe(true);
		expect(customOutputChangesDisabled(false, true)).toBe(true);
		expect(customOutputChangesDisabled(false, false)).toBe(false);
	});
});
