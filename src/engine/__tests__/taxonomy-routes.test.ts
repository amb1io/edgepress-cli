import { describe, it, expect } from "vitest";
import { buildTaxonomyPublicPath } from "../taxonomy-routes.ts";

describe("taxonomy-routes", () => {
  it("builds public taxonomy paths with locale prefix", () => {
    expect(buildTaxonomyPublicPath("category", "sample-term", "")).toBe("/category/sample-term");
    expect(buildTaxonomyPublicPath("categorias", "foo", "/en")).toBe("/en/categorias/foo");
  });
});
