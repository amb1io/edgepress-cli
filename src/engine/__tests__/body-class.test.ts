import { describe, it, expect } from "vitest";
import { buildBodyClass, templateKeyToBodySlug } from "../body-class.ts";

describe("templateKeyToBodySlug", () => {
  it("normalizes index and nested templates", () => {
    expect(templateKeyToBodySlug("index")).toBe("index");
    expect(templateKeyToBodySlug("diretores/index")).toBe("diretores-index");
    expect(templateKeyToBodySlug("team/[category]")).toBe("team-category");
    expect(templateKeyToBodySlug("docs/[...path]")).toBe("docs-path");
  });
});

describe("buildBodyClass", () => {
  it("includes template slug and route section for diretores index", () => {
    expect(
      buildBodyClass(
        {
          kind: "page",
          locale: "pt-br",
          path: "/diretores",
          templateKey: "diretores/index",
          params: {},
        },
        { slug: "diretores", post_type_slug: "page", title: "Diretores" } as never,
        "page",
      ),
    ).toBe(
      "route-page locale-pt_br slug-diretores-index route-diretores type-page slug-diretores",
    );
  });

  it("merges extra layout classes", () => {
    expect(
      buildBodyClass(
        {
          kind: "home",
          locale: "pt-br",
          path: "/",
          templateKey: "index",
          params: {},
        },
        undefined,
        "home",
        undefined,
        "is-front",
      ),
    ).toContain("slug-index is-front");
  });
});
