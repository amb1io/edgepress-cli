import { describe, it, expect, vi } from "vitest";
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
    route: { kind: "home", path: "/", locale: "pt-br", template_key: "index", params: {} },
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

describe("get_taxonomies_locale tag", () => {
  it("assigns taxonomy metadata and localized terms", async () => {
    const liquid = new Liquid();
    registerThemeApi(liquid);
    const html = await liquid.parseAndRender(
      `{% get_taxonomies_locale 'post', 'category', 'pt-br' as categories %}
{{ categories.taxonomy.name }}:{{ categories.taxonomy.slug }}:{{ categories.taxonomy.original_name }}:{{ categories.taxonomy.original_slug }}
{% for term in categories.values %}{{ term.id }}:{{ term.name }}:{{ term.slug }}:{{ term.locale }}{% endfor %}`,
      baseContext({
        get_taxonomies_locale: async (_postType, _taxonomyType, locale) => ({
          taxonomy: {
            name: "Categorias",
            slug: "category",
            original_name: "Category",
            original_slug: "category",
          },
          values: [{ id: 12, name: "Tecnologia", slug: "tecnologia", locale }],
        }),
      }) as unknown as object,
    );

    expect(html).toContain("Categorias:category:Category:category");
    expect(html).toContain("12:Tecnologia:tecnologia:pt-br");
  });
});

describe("get_taxonomy_posts tag", () => {
  it("resolves dynamic route params at render time", async () => {
    const liquid = new Liquid();
    registerThemeApi(liquid);
    const handler = vi.fn(async () => [{ id: 1, title: "Item", slug: "item", excerpt: "", body_html: "", author_name: "", published_at: null, post_type_slug: "post", meta: {} }]);

    await liquid.parseAndRender(
      `{% get_taxonomy_posts 'category', route.params.category as items %}{{ items[0].title }}`,
      baseContext({
        route: {
          kind: "page",
          path: "/portfolio/design",
          locale: "pt-br",
          template_key: "portfolio/[category]",
          params: { category: "design" },
        },
        get_taxonomy_posts: handler,
      }) as unknown as object,
    );

    expect(handler).toHaveBeenCalledWith("category", "design", undefined);
  });
});
