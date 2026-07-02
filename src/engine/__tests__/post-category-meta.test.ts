import { describe, expect, it } from "vitest";
import { injectCategoryMeta } from "../post-category-meta.ts";

describe("injectCategoryMeta", () => {
  it("injects category_slug and category_name from first category taxonomy", () => {
    const meta: Record<string, string> = {};
    injectCategoryMeta(meta, [{ type: "category", slug: "progcast", name: "Progcast" }]);
    expect(meta).toEqual({
      category_slug: "progcast",
      category_name: "Progcast",
    });
  });
});
