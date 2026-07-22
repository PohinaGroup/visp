import { describe, expect, test } from "bun:test";

import { alternateLinks } from "./i18n";

describe("alternateLinks", () => {
  test("maps English and Finnish documentation URLs both ways", () => {
    expect(alternateLinks("/docs/get-started")[1]?.href).toBe(
      "https://docs.visp-stream.com/fi/docs/get-started",
    );
    expect(alternateLinks("/fi/docs/get-started")[0]?.href).toBe(
      "https://docs.visp-stream.com/docs/get-started",
    );
  });
});
