import { describe, it, expect } from "vitest";
import { buildTemplateCandidates, resolveTemplateKey } from "../resolve-template.ts";

const baseTemplates: Record<string, string> = {
  home: "<div>home</div>",
  archive: "<div>archive</div>",
};

describe("resolve-template", () => {
  it("prefers taxonomy-specific templates for taxonomy routes", () => {
    const templates = {
      ...baseTemplates,
      "taxonomy-category-visum": "<div>visum</div>",
      "taxonomy-category": "<div>category</div>",
      taxonomy: "<div>taxonomy</div>",
    };
    expect(
      resolveTemplateKey("taxonomy", templates, {
        taxonomyType: "category",
        taxonomySlug: "visum",
      }),
    ).toBe("taxonomy-category-visum");
    expect(
      buildTemplateCandidates("taxonomy", { taxonomyType: "category", taxonomySlug: "visum" }),
    ).toEqual([
      "taxonomy-category-visum",
      "taxonomy-category",
      "taxonomy",
      "archive-category",
      "archive",
      "index",
    ]);
  });
});
