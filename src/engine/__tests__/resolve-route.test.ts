import { describe, it, expect } from "vitest";
import { resolvePreRoute } from "../resolve-route.ts";
import { resolveRouteKind } from "../resolve-route-kind.ts";
import { resolveThemeRoute } from "../resolve-theme-route.ts";
import type { RouteKindResolverDeps } from "../resolve-route-kind.ts";

const themeTemplates = [
  "index",
  "search",
  "404",
  "posts/index",
  "category/[slug]",
  "portfolio/index",
  "portfolio/[category]",
  "[slug]",
];

function mockDeps(overrides: Partial<RouteKindResolverDeps> = {}): RouteKindResolverDeps {
  return {
    archivablePostTypes: [{ slug: "post", name: "Post" }],
    taxonomyTypes: ["category", "tag"],
    resolvePostBySlug: async (slug) =>
      slug === "portfolio" ? { post_type_slug: "page" } : null,
    resolveTaxonomyTerm: async (type, slug) =>
      type === "category" && slug === "sample-term" ? { slug: "sample-term" } : null,
    ...overrides,
  };
}

describe("resolvePreRoute", () => {
  it("matches home index", () => {
    const pre = resolvePreRoute("/", new URLSearchParams(), themeTemplates);
    expect(pre.matched?.templateKey).toBe("index");
    expect(pre.locale).toBe("pt-br");
  });

  it("matches posts archive template", () => {
    const pre = resolvePreRoute("/posts", new URLSearchParams(), themeTemplates);
    expect(pre.matched?.templateKey).toBe("posts/index");
  });

  it("matches portfolio routes", () => {
    expect(
      resolvePreRoute("/portfolio", new URLSearchParams(), themeTemplates).matched?.templateKey,
    ).toBe("portfolio/index");
    expect(
      resolvePreRoute("/portfolio/design", new URLSearchParams(), themeTemplates).matched,
    ).toEqual({
      templateKey: "portfolio/[category]",
      params: { category: "design" },
      staticSegments: ["portfolio"],
    });
  });

  it("matches search route", () => {
    const pre = resolvePreRoute("/search", new URLSearchParams("q=foo&page=2"), themeTemplates);
    expect(pre.matched?.templateKey).toBe("search");
    expect(pre.searchQuery).toBe("foo");
    expect(pre.page).toBe(2);
  });
});

describe("resolveThemeRoute", () => {
  it("resolves home", async () => {
    const route = await resolveThemeRoute("/", new URLSearchParams(), themeTemplates, mockDeps());
    expect(route).toMatchObject({
      kind: "home",
      templateKey: "index",
      locale: "pt-br",
      path: "/",
    });
  });

  it("resolves post archive at /posts", async () => {
    const route = await resolveThemeRoute("/posts", new URLSearchParams(), themeTemplates, mockDeps());
    expect(route).toMatchObject({
      kind: "archive",
      templateKey: "posts/index",
      postType: "post",
    });
  });

  it("resolves taxonomy archive at /category/{slug}", async () => {
    const route = await resolveThemeRoute(
      "/category/sample-term",
      new URLSearchParams(),
      themeTemplates,
      mockDeps(),
    );
    expect(route).toMatchObject({
      kind: "taxonomy",
      templateKey: "category/[slug]",
      taxonomyType: "category",
      taxonomySlug: "sample-term",
      params: { slug: "sample-term" },
    });
  });

  it("resolves portfolio page with category param", async () => {
    const route = await resolveThemeRoute(
      "/portfolio/design",
      new URLSearchParams(),
      themeTemplates,
      mockDeps({
        resolveTaxonomyTerm: async () => null,
      }),
    );
    expect(route).toMatchObject({
      kind: "page",
      templateKey: "portfolio/[category]",
      slug: "portfolio",
      params: { category: "design" },
    });
  });

  it("resolves single post via root [slug] template", async () => {
    const route = await resolveThemeRoute(
      "/my-post",
      new URLSearchParams(),
      themeTemplates,
      mockDeps({
        resolvePostBySlug: async (slug) =>
          slug === "my-post" ? { post_type_slug: "post" } : null,
      }),
    );
    expect(route).toMatchObject({
      kind: "single",
      templateKey: "[slug]",
      slug: "my-post",
      params: { slug: "my-post" },
    });
  });

  it("returns 404 when no template matches", async () => {
    const route = await resolveThemeRoute(
      "/missing/path",
      new URLSearchParams(),
      themeTemplates,
      mockDeps(),
    );
    expect(route.kind).toBe("404");
    expect(route.templateKey).toBe("404");
  });
});

describe("resolveRouteKind", () => {
  it("classifies taxonomy when base segment is a taxonomy type", async () => {
    const resolved = await resolveRouteKind(
      {
        templateKey: "category/[slug]",
        params: { slug: "sample-term" },
        staticSegments: ["category"],
      },
      mockDeps(),
    );
    expect(resolved.kind).toBe("taxonomy");
    expect(resolved.taxonomyType).toBe("category");
  });
});
