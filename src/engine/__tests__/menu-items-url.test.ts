import { describe, expect, it } from "vitest";
import {
  buildMenuItemUrl,
  menuChildPostToLinkItem,
  parseLinkType,
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
