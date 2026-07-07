import { describe, it, expect } from "vitest";
import { normalizeTemplateKey } from "../resolve-template.ts";

describe("resolve-template", () => {
  it("normalizes template keys", () => {
    expect(normalizeTemplateKey("templates/portfolio/[category].liquid")).toBe(
      "portfolio/[category]",
    );
    expect(normalizeTemplateKey("index.liquid")).toBe("index");
  });
});
