import { describe, it, expect, vi } from "vitest";
import {
  parseGetAuthorArgs,
  createGetAuthorHandler,
  parseGetTaxonomyPostsArgs,
  createGetTaxonomyPostsHandler,
  normalizeTaxonomyPostsLimit,
  parseGetPostsArgs,
  createGetPostsHandler,
  parseGetTaxonomiesLocaleArgs,
} from "../theme-functions.ts";

describe("parseGetTaxonomiesLocaleArgs", () => {
  it("parses valid 3-arg + as syntax", () => {
    expect(parseGetTaxonomiesLocaleArgs("'post', 'category', 'pt-br' as cats")).toEqual({
      postType: "post",
      taxonomyType: "category",
      locale: "pt-br",
      varName: "cats",
    });
    expect(parseGetTaxonomiesLocaleArgs('"post", "category", "en" as terms')).toEqual({
      postType: "post",
      taxonomyType: "category",
      locale: "en",
      varName: "terms",
    });
  });

  it("returns null for invalid syntax", () => {
    expect(parseGetTaxonomiesLocaleArgs("'post', 'category' as cats")).toBeNull();
    expect(parseGetTaxonomiesLocaleArgs("post, category, pt-br as cats")).toBeNull();
    expect(parseGetTaxonomiesLocaleArgs("")).toBeNull();
    expect(parseGetTaxonomiesLocaleArgs("'post', 'category', 'pt-br'")).toBeNull();
  });
});

describe("parseGetTaxonomyPostsArgs", () => {
  it("parses literal taxonomy type and slug", () => {
    expect(parseGetTaxonomyPostsArgs("'category', 'cliente' as clients")).toEqual({
      taxonomyTypeExpr: "'category'",
      taxonomySlugExpr: "'cliente'",
      varName: "clients",
    });
  });

  it("parses optional literal limit", () => {
    expect(parseGetTaxonomyPostsArgs("'category', 'cliente', 500 as clients")).toEqual({
      taxonomyTypeExpr: "'category'",
      taxonomySlugExpr: "'cliente'",
      limitExpr: "500",
      varName: "clients",
    });
  });

  it("parses variable expressions", () => {
    expect(parseGetTaxonomyPostsArgs("taxonomy_slug, taxonomy_value as jobs")).toEqual({
      taxonomyTypeExpr: "taxonomy_slug",
      taxonomySlugExpr: "taxonomy_value",
      varName: "jobs",
    });
  });

  it("parses mixed literal and expression", () => {
    expect(parseGetTaxonomyPostsArgs("'category', route.params.category as posts")).toEqual({
      taxonomyTypeExpr: "'category'",
      taxonomySlugExpr: "route.params.category",
      varName: "posts",
    });
  });

  it("parses dynamic limit expression", () => {
    expect(parseGetTaxonomyPostsArgs("taxonomy_slug, taxonomy_value, my_limit as jobs")).toEqual({
      taxonomyTypeExpr: "taxonomy_slug",
      taxonomySlugExpr: "taxonomy_value",
      limitExpr: "my_limit",
      varName: "jobs",
    });
  });

  it("returns null for invalid syntax", () => {
    expect(parseGetTaxonomyPostsArgs("'category' as clients")).toBeNull();
    expect(parseGetTaxonomyPostsArgs("as jobs")).toBeNull();
  });
});

describe("createGetTaxonomyPostsHandler", () => {
  it("returns empty without fetch when taxonomy args are empty", async () => {
    const fetcher = vi.fn();
    const handler = createGetTaxonomyPostsHandler(fetcher);
    expect(await handler("category", "  ")).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes limit before fetch", async () => {
    const fetcher = vi.fn(async () => []);
    const handler = createGetTaxonomyPostsHandler(fetcher);
    await handler("category", "cliente", 0);
    expect(fetcher).toHaveBeenCalledWith("category", "cliente", normalizeTaxonomyPostsLimit(0));
  });
});

describe("parseGetPostsArgs", () => {
  it("parses post type slug", () => {
    expect(parseGetPostsArgs("'equipe' as team")).toEqual({
      postTypeSlug: "equipe",
      varName: "team",
    });
  });

  it("parses optional limit", () => {
    expect(parseGetPostsArgs("'equipe', 200 as team")).toEqual({
      postTypeSlug: "equipe",
      limit: 200,
      varName: "team",
    });
  });
});

describe("createGetPostsHandler", () => {
  it("returns empty without fetch when post type is empty", async () => {
    const fetcher = vi.fn();
    const handler = createGetPostsHandler(fetcher);
    expect(await handler("")).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes limit before fetch", async () => {
    const fetcher = vi.fn(async () => []);
    const handler = createGetPostsHandler(fetcher);
    await handler("equipe", 0);
    expect(fetcher).toHaveBeenCalledWith("equipe", normalizeTaxonomyPostsLimit(0));
  });
});

describe("parseGetAuthorArgs", () => {
  it("parses id/slug expression", () => {
    expect(parseGetAuthorArgs("post.id as author")).toEqual({
      idOrSlugExpr: "post.id",
      varName: "author",
    });
  });

  it("returns null for invalid syntax", () => {
    expect(parseGetAuthorArgs("post.id")).toBeNull();
  });
});

describe("createGetAuthorHandler", () => {
  it("returns null without fetch when id is empty", async () => {
    const fetcher = vi.fn();
    const handler = createGetAuthorHandler(fetcher);
    expect(await handler("")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
