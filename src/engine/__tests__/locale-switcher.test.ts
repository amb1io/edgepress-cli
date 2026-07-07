import { describe, it, expect } from "vitest";
import { buildLocaleSwitcherUrl } from "../locale-switcher.ts";
import type { ResolvedPublicRoute } from "../types.ts";
import { createMockTaxonomyTranslationResolver } from "../taxonomy-translation-client.ts";

describe("locale-switcher", () => {
  it("builds taxonomy archive URLs", async () => {
    const route: ResolvedPublicRoute = {
      kind: "taxonomy",
      locale: "pt-br",
      path: "/category/sample-term",
      page: 1,
      templateKey: "category/[slug]",
      params: { slug: "sample-term" },
      taxonomyType: "category",
      taxonomySlug: "sample-term",
    };
    expect(await buildLocaleSwitcherUrl("pt-br", route, "taxonomy")).toBe("/category/sample-term");
    expect(await buildLocaleSwitcherUrl("en", route, "taxonomy")).toBe("/en/category/sample-term");
  });

  it("uses translated slug per locale on taxonomy routes", async () => {
    const route: ResolvedPublicRoute = {
      kind: "taxonomy",
      locale: "pt-br",
      path: "/category/sample-term",
      page: 1,
      templateKey: "category/[slug]",
      params: { slug: "sample-term" },
      taxonomyType: "category",
      taxonomySlug: "sample-term",
    };
    const resolver = createMockTaxonomyTranslationResolver("pt-br");
    expect(
      await buildLocaleSwitcherUrl("en", route, "taxonomy", {
        taxonomyCanonicalSlug: "sample-term",
        resolveLocalizedTaxonomySlug: (slug, locale) => resolver.getLocalizedSlug(slug, locale),
      }),
    ).toBe("/en/category/sample-en");
  });
});

describe("taxonomy-translation-client mock", () => {
  it("resolves translated slug to canonical term", async () => {
    const resolver = createMockTaxonomyTranslationResolver("en");
    const term = await resolver.resolveTermBySlug("category", "sample-en");
    expect(term?.slug).toBe("sample-term");
    const localized = await resolver.localizeTerm(term!);
    expect(localized.slug).toBe("sample-en");
    expect(localized.name).toBe("Sample");
  });
});
