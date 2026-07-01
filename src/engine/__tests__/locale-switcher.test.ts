import { describe, it, expect } from "vitest";
import { buildLocaleSwitcherUrl } from "../locale-switcher.ts";
import type { ResolvedPublicRoute } from "../types.ts";

describe("locale-switcher", () => {
  it("builds taxonomy archive URLs", () => {
    const route: ResolvedPublicRoute = {
      kind: "taxonomy",
      locale: "pt-br",
      path: "/category/visum",
      page: 1,
      taxonomyBase: "category",
      taxonomyType: "category",
      taxonomySlug: "visum",
    };
    expect(buildLocaleSwitcherUrl("pt-br", route, "taxonomy")).toBe("/category/visum");
    expect(buildLocaleSwitcherUrl("en", route, "taxonomy")).toBe("/en/category/visum");
  });
});
