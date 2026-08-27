import { describe, expect, test } from "bun:test";
import {
	customOutputStatus,
	customOutputsForPath,
} from "./custom-direct-output";

const outputs = [
	{
		id: "landscape",
		destinationId: "destination",
		pathId: 1,
		role: "landscape" as const,
		state: "live",
		error: null,
	},
	{
		id: "portrait",
		destinationId: "destination",
		pathId: 1,
		role: "portrait" as const,
		state: "failed",
		error: "No free Direct slot",
	},
];

describe("custom Direct output projection", () => {
	test("keeps landscape and portrait assignments independent", () => {
		expect(customOutputsForPath(outputs, "destination", 1)).toEqual({
			landscape: outputs[0],
			portrait: outputs[1],
		});
	});

	test("prefers the sanitized error over lifecycle state", () => {
		expect(customOutputStatus(outputs[1])).toBe("No free Direct slot");
		expect(customOutputStatus()).toBe("Configured");
	});
});
