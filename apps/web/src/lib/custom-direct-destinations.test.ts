import { describe, expect, test } from "bun:test";

import {
	customDestinationDraft,
	customDestinationUpdateInput,
} from "./custom-direct-destinations";

describe("custom destination form state", () => {
	test("never copies a stored credential into an edit form", () => {
		expect(
			customDestinationDraft({
				id: "one",
				name: "Primary",
				protocol: "rtmps",
				endpointSummary: "rtmps://ingest.example.com:443",
			}),
		).toEqual({ name: "Primary", url: "" });
	});

	test("omits a blank replacement URL and trims submitted values", () => {
		expect(
			customDestinationUpdateInput("one", {
				name: "  Renamed  ",
				url: "  ",
			}),
		).toEqual({ destinationId: "one", name: "Renamed" });
		expect(
			customDestinationUpdateInput("one", {
				name: "Renamed",
				url: "  srt://example.com:9000?streamid=secret  ",
			}),
		).toEqual({
			destinationId: "one",
			name: "Renamed",
			url: "srt://example.com:9000?streamid=secret",
		});
	});
});
