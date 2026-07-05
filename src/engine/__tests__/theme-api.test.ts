import { describe, it, expect } from "vitest";
import { Liquid } from "liquidjs";
import { registerThemeApi, shouldLoadBlockNoteAssets } from "../theme-api.ts";
import type { ThemeRenderContext } from "../types.ts";

function baseContext(overrides: Partial<ThemeRenderContext> = {}): ThemeRenderContext {
  return {
    site: {
      title: "Demo",
      description: "",
      locale: "pt-br",
      locale_prefix: "",
      home_url: "/",
      base_url: "http://localhost:4322",
      html_lang: "pt-BR",
      year: 2026,
    },
    seo: {
      title: "Demo",
      description: "",
      canonical: "http://localhost:4322/",
      og_type: "website",
    },
    menus: {},
    theme: {
      slug: "test",
      version: "1.0.0",
      asset_base_url: "http://localhost:4322/themes-assets/test",
      supports: ["blocknote"],
    },
    route: { kind: "home", path: "/", locale: "pt-br" },
    body_class: "route-home",
    locale_switcher: [],
    post: {
      id: 1,
      title: "Home",
      slug: "home",
      excerpt: "",
      body_html: "<h3>Fallback</h3>",
      body_blocks: '[{"id":"a","type":"paragraph","content":[]}]',
      author_name: "",
      published_at: null,
      post_type_slug: "page",
      meta: {},
    },
    posts: [],
    archive: { title: "Blog", type: "post" },
    pagination: { page: 1, total_pages: 1 },
    is_front_page: true,
    is_single: false,
    is_page: false,
    is_singular: false,
    is_archive: false,
    is_search: false,
    is_404: false,
    have_posts: false,
    ...overrides,
  };
}

describe("blocknote_content tag", () => {
  it("renders fallback and hydration mount node", async () => {
    const liquid = new Liquid();
    registerThemeApi(liquid);
    const html = await liquid.parseAndRender(
      "{% blocknote_content %}",
      baseContext() as unknown as object,
    );

    expect(html).toContain("edgepress-blocknote-fallback");
    expect(html).toContain("Fallback");
    expect(html).toContain("edgepress-blocknote-root");
    expect(html).toContain("edgepress-blocknote-data");
  });

  it("injects BlockNote dev bundle in scripts_footer when enabled", async () => {
    const liquid = new Liquid();
    registerThemeApi(liquid);
    const html = await liquid.parseAndRender(
      "{% scripts_footer %}",
      baseContext() as unknown as object,
    );

    expect(html).toContain("/edgepress-assets/blocknote-readonly.js");
    expect(html).toContain("/edgepress-assets/blocknote-readonly.css");
  });

  it("shouldLoadBlockNoteAssets is false without blocknote support", () => {
    expect(
      shouldLoadBlockNoteAssets(
        baseContext({
          theme: {
            slug: "test",
            version: "1.0.0",
            asset_base_url: "http://localhost:4322/themes-assets/test",
            supports: ["home"],
          },
        }),
      ),
    ).toBe(false);
  });
});
