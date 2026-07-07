import { describe, it, expect } from "vitest";
import {
  buildRouteTable,
  isRoutableTemplateKey,
  matchRoute,
  parseTemplateKeyToRoute,
} from "../file-router.ts";

describe("file-router", () => {
  it("skips non-routable template keys", () => {
    expect(isRoutableTemplateKey("layouts/base")).toBe(false);
    expect(isRoutableTemplateKey("parts/header")).toBe(false);
    expect(isRoutableTemplateKey("404")).toBe(false);
    expect(isRoutableTemplateKey("archive")).toBe(false);
    expect(isRoutableTemplateKey("portfolio/index")).toBe(true);
  });

  it("parses index and dynamic routes", () => {
    expect(parseTemplateKeyToRoute("index")).toEqual({
      templateKey: "index",
      segments: [],
      priority: 1,
    });
    expect(parseTemplateKeyToRoute("portfolio/[category]")).toMatchObject({
      templateKey: "portfolio/[category]",
      segments: [
        { type: "static", value: "portfolio" },
        { type: "dynamic", param: "category" },
      ],
    });
    expect(parseTemplateKeyToRoute("[slug]")).toMatchObject({
      templateKey: "[slug]",
      segments: [{ type: "dynamic", param: "slug" }],
    });
  });

  it("matches home index", () => {
    const table = buildRouteTable(["index", "[slug]"]);
    expect(matchRoute(table, [])).toEqual({
      templateKey: "index",
      params: {},
      staticSegments: [],
    });
  });

  it("matches nested index and dynamic child", () => {
    const table = buildRouteTable([
      "portfolio/index",
      "portfolio/[category]",
      "[slug]",
    ]);
    expect(matchRoute(table, ["portfolio"])).toEqual({
      templateKey: "portfolio/index",
      params: {},
      staticSegments: ["portfolio"],
    });
    expect(matchRoute(table, ["portfolio", "design"])).toEqual({
      templateKey: "portfolio/[category]",
      params: { category: "design" },
      staticSegments: ["portfolio"],
    });
  });

  it("prefers static segment over root dynamic slug", () => {
    const table = buildRouteTable(["portfolio/index", "[slug]"]);
    expect(matchRoute(table, ["portfolio"])?.templateKey).toBe("portfolio/index");
    expect(matchRoute(table, ["about"])?.templateKey).toBe("[slug]");
  });

  it("matches search and posts archive templates", () => {
    const table = buildRouteTable(["search", "posts/index", "category/[slug]"]);
    expect(matchRoute(table, ["search"])?.templateKey).toBe("search");
    expect(matchRoute(table, ["posts"])?.templateKey).toBe("posts/index");
    expect(matchRoute(table, ["category", "sample-term"])).toEqual({
      templateKey: "category/[slug]",
      params: { slug: "sample-term" },
      staticSegments: ["category"],
    });
  });

  it("returns null when no route matches", () => {
    const table = buildRouteTable(["index", "portfolio/index"]);
    expect(matchRoute(table, ["missing", "path"])).toBeNull();
  });

  it("supports catch-all segments", () => {
    const table = buildRouteTable(["docs/[...path]"]);
    expect(matchRoute(table, ["docs", "a", "b"])).toEqual({
      templateKey: "docs/[...path]",
      params: { path: "a/b" },
      staticSegments: ["docs"],
    });
  });
});
