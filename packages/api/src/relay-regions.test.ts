import { expect, test } from "bun:test";
import { relayRegionLabel } from "./relay-regions";

test("region codes become display names", () => {
	expect(relayRegionLabel("fi")).toBe("Finland");
	expect(relayRegionLabel("us-east-1")).toBe("US East");
	expect(relayRegionLabel("US_EAST")).toBe("US East");
	expect(relayRegionLabel("sin")).toBe("Singapore");
	expect(relayRegionLabel("ap-northeast-1")).toBe("Tokyo");
});

test("operator display names are kept and unknown codes are title-cased", () => {
	expect(relayRegionLabel("US East (Ashburn)")).toBe("US East (Ashburn)");
	expect(relayRegionLabel("Finland")).toBe("Finland");
	expect(relayRegionLabel("default")).toBe("Default");
	expect(relayRegionLabel("eu-central")).toBe("EU Central");
	expect(relayRegionLabel("  ")).toBe("Unknown region");
});
