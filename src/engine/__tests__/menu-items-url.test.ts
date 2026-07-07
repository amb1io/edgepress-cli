import { describe, expect, it } from "vitest";
import {
  buildMenuItemTree,
  buildMenuItemUrl,
  menuChildPostToFlatItem,
  menuChildPostToLinkItem,
  parseLinkType,
  type MenuItemFlatPublic,
} from "../menu-items-url.ts";

describe("buildMenuItemUrl", () => {
  it("returns custom URL from body", () => {
    expect(
      buildMenuItemUrl({
        link_type: "custom",
        body: "https://example.com/about",
      }),
    ).toBe("https://example.com/about");
  });

  it("builds post link with locale prefix for English", () => {
    expect(
      buildMenuItemUrl({
        link_type: "post",
        target_slug: "hello-world",
        target_locale_code: "en_US",
      }),
    ).toBe("/en/hello-world");
  });

  it("builds post link without prefix for pt-br default", () => {
    expect(
      buildMenuItemUrl({
        link_type: "post",
        target_slug: "sobre",
        target_locale_code: "pt_BR",
      }),
    ).toBe("/sobre");
  });

  it("builds taxonomy link for category", () => {
    expect(
      buildMenuItemUrl({
        link_type: "taxonomy",
        target_slug: "uncategorized",
        target_taxonomy_type: "category",
        target_locale_code: "pt_BR",
      }),
    ).toBe("/category/uncategorized");
  });

  it("builds taxonomy link with locale prefix for English", () => {
    expect(
      buildMenuItemUrl({
        link_type: "taxonomy",
        target_slug: "foo",
        target_taxonomy_type: "category",
        target_locale_code: "en_US",
      }),
    ).toBe("/en/category/foo");
  });
});

describe("parseLinkType", () => {
  it("recognizes taxonomy and custom", () => {
    expect(parseLinkType("taxonomy")).toBe("taxonomy");
    expect(parseLinkType("custom")).toBe("custom");
    expect(parseLinkType("post")).toBe("post");
    expect(parseLinkType(undefined)).toBe("post");
  });
});

describe("menuChildPostToLinkItem", () => {
  it("maps taxonomy child post meta to label and url", () => {
    expect(
      menuChildPostToLinkItem(
        {
          title: "News",
          body: "",
          meta_values: {
            link_type: "taxonomy",
            target_slug: "news",
            target_taxonomy_type: "category",
            target_locale_code: "pt_BR",
          },
        },
        "pt_BR",
      ),
    ).toEqual({ label: "News", url: "/category/news" });
  });
});

describe("menuChildPostToFlatItem", () => {
  it("extracts submenu fields from meta_values", () => {
    const flat = menuChildPostToFlatItem(
      {
        id: 42,
        title: "Design",
        slug: "design-42",
        body: "",
        meta_values: {
          link_type: "post",
          target_post_id: 10,
          target_slug: "design",
          parent_menu_item_id: 5,
          submenu_sort: "creation",
          submenu_display: ["title", "thumbnail"],
        },
      },
      "pt_BR",
    );

    expect(flat).toMatchObject({
      id: 42,
      label: "Design",
      slug: "design-42",
      target_post_id: 10,
      parent_menu_item_id: 5,
      submenu_sort: "creation",
      submenu_display: ["title", "thumbnail"],
    });
  });
});

describe("buildMenuItemTree", () => {
  it("builds nested tree from flat rows", () => {
    const flat: MenuItemFlatPublic[] = [
      {
        id: 1,
        label: "Parent",
        url: "/parent",
        slug: "parent-1",
        order: 1,
        parent_menu_item_id: null,
      },
      {
        id: 2,
        label: "Child",
        url: "/child",
        slug: "child-1",
        order: 1,
        parent_menu_item_id: 1,
      },
    ];
    const tree = buildMenuItemTree(flat);
    expect(tree[0]?.children).toHaveLength(1);
    expect(tree[0]?.children[0]?.slug).toBe("child-1");
  });
});
