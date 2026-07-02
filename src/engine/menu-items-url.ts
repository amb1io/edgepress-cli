/**
 * Menu item URL building — parity with edgepress menu-items-service (DB-free subset).
 */
import {
  normalizePublicLocale,
  publicLocaleUrlPrefix,
} from "./resolve-route.ts";
import {
  buildTaxonomyPublicPath,
  taxonomyTypeToUrlBase,
} from "./taxonomy-routes.ts";
import type { MenuItem } from "./types.ts";

export type MenuLinkType = "post" | "custom" | "taxonomy";

export function parseLinkType(raw: unknown): MenuLinkType {
  if (raw === "custom") return "custom";
  if (raw === "taxonomy") return "taxonomy";
  return "post";
}

export function parsePostMetaValues(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function buildMenuItemUrl(input: {
  link_type: MenuLinkType;
  body?: string | null;
  target_slug?: string | null;
  target_locale_code?: string | null;
  target_taxonomy_type?: string | null;
}): string {
  if (input.link_type === "custom") {
    return String(input.body ?? "").trim();
  }

  const slug = String(input.target_slug ?? "").trim();
  if (!slug) return "";

  const localeCode = String(input.target_locale_code ?? "pt_BR").trim();
  const publicLocale = normalizePublicLocale(
    localeCode.replace(/_/g, "-").toLowerCase(),
  );
  const prefix = publicLocaleUrlPrefix(publicLocale);

  if (input.link_type === "taxonomy") {
    const taxonomyType = String(input.target_taxonomy_type ?? "").trim();
    if (!taxonomyType) return "";
    const urlBase = taxonomyTypeToUrlBase(taxonomyType);
    return buildTaxonomyPublicPath(urlBase, slug, prefix);
  }

  return `${prefix}/${slug}`.replace(/\/+/g, "/") || `/${slug}`;
}

export function menuChildPostToLinkItem(
  row: {
    title?: string | null;
    body?: string | null;
    meta_values?: unknown;
  },
  dbLocale: string,
): { label: string; url: string } | null {
  const meta = parsePostMetaValues(row.meta_values);
  const linkType = parseLinkType(meta["link_type"]);
  const label = String(row.title ?? "").trim();
  const url = buildMenuItemUrl({
    link_type: linkType,
    body: row.body,
    target_slug:
      typeof meta["target_slug"] === "string" ? meta["target_slug"] : null,
    target_locale_code:
      typeof meta["target_locale_code"] === "string"
        ? meta["target_locale_code"]
        : dbLocale,
    target_taxonomy_type:
      typeof meta["target_taxonomy_type"] === "string"
        ? meta["target_taxonomy_type"]
        : null,
  });

  if (!label || !url) return null;
  return { label, url };
}

export function menuOrderFromMeta(meta: Record<string, unknown>): number {
  const order = meta["menu_order"];
  return typeof order === "number" ? order : 9999;
}

export function buildThemeMenusRecord(
  menusByLocation: Record<string, { label: string; url: string }[]>,
  currentPath: string,
): Record<string, MenuItem[]> {
  const normPath = currentPath.replace(/\/+$/, "") || "/";
  const menus: Record<string, MenuItem[]> = {};
  for (const [location, items] of Object.entries(menusByLocation)) {
    menus[location] = items.map((item) => ({
      label: item.label,
      url: item.url,
      active:
        item.url !== "" &&
        normPath === item.url.replace(/\/+$/, ""),
    }));
  }
  return menus;
}
