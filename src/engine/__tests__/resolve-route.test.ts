import { describe, it, expect } from "vitest";
import { resolvePublicRoute } from "../resolve-route.ts";

describe("resolvePublicRoute", () => {
  it("resolves home", () => {
    expect(resolvePublicRoute("/", new URLSearchParams())).toEqual({
      kind: "home",
      locale: "pt-br",
      path: "/",
    });
  });

  it("resolves post archive alias at /posts", () => {
    expect(resolvePublicRoute("/posts", new URLSearchParams())).toEqual({
      kind: "archive",
      locale: "pt-br",
      path: "/posts",
      postType: "post",
      page: 1,
    });
  });

  it("resolves taxonomy archive at /category/{slug}", () => {
    expect(resolvePublicRoute("/category/visum", new URLSearchParams())).toEqual({
      kind: "taxonomy",
      locale: "pt-br",
      path: "/category/visum",
      page: 1,
      taxonomyBase: "category",
      taxonomyType: "category",
      taxonomySlug: "visum",
    });
  });

  it("resolves localized taxonomy archives", () => {
    expect(resolvePublicRoute("/en/tag/foo", new URLSearchParams())).toEqual({
      kind: "taxonomy",
      locale: "en",
      path: "/en/tag/foo",
      page: 1,
      taxonomyBase: "tag",
      taxonomyType: "tag",
      taxonomySlug: "foo",
    });
  });

  it("treats /category alone as a page slug, not taxonomy", () => {
    expect(resolvePublicRoute("/category", new URLSearchParams())).toEqual({
      kind: "page",
      locale: "pt-br",
      path: "/category",
      slug: "category",
      page: 1,
    });
  });

  it("returns 404 for invalid taxonomy term slug", () => {
    expect(resolvePublicRoute("/category/bad slug", new URLSearchParams())).toEqual({
      kind: "404",
      locale: "pt-br",
      path: "/category/bad slug",
    });
  });

  it("resolves search route", () => {
    expect(resolvePublicRoute("/search", new URLSearchParams("q=foo&page=2"))).toEqual({
      kind: "search",
      locale: "pt-br",
      path: "/search",
      searchQuery: "foo",
      page: 2,
    });
    expect(resolvePublicRoute("/en/search", new URLSearchParams())).toEqual({
      kind: "search",
      locale: "en",
      path: "/en/search",
      searchQuery: "",
      page: 1,
    });
  });
});
