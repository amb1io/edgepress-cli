/**
 * Menu item URL building and tree assembly — parity with edgepress menu-items-service (DB-free subset).
 */
import {
  normalizePublicLocale,
  publicLocaleUrlPrefix,
} from "./resolve-route.ts";
import { buildTaxonomyPublicPath } from "./taxonomy-routes.ts";
import type { MenuItem } from "./types.ts";

export type MenuLinkType = "post" | "custom" | "taxonomy";

export type SubMenuSort = "alphabetical" | "creation";

export type SubMenuDisplay = "title" | "thumbnail" | "excerpt";

/** Flat menu row before tree assembly. */
export type MenuItemFlatPublic = {
  id: number;
  label: string;
  url: string;
  slug: string;
  target_post_id?: number | null;
  order: number;
  parent_menu_item_id: number | null;
  submenu_sort?: SubMenuSort;
  submenu_display?: SubMenuDisplay[];
};

/** Nested menu item before active flag mapping. */
export type MenuItemPublicRaw = Omit<MenuItemFlatPublic, "parent_menu_item_id" | "order"> & {
  children: MenuItemPublicRaw[];
};

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

function parseSubMenuSort(raw: unknown): SubMenuSort | undefined {
  if (raw === "alphabetical" || raw === "creation") return raw;
  return undefined;
}

function parseSubMenuDisplay(raw: unknown): SubMenuDisplay[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<SubMenuDisplay>(["title", "thumbnail", "excerpt"]);
  return raw.filter(
    (v): v is SubMenuDisplay => typeof v === "string" && allowed.has(v as SubMenuDisplay),
  );
}

export function parseParentMenuItemId(raw: unknown): number | null {
  if (typeof raw === "number" && raw > 0) return raw;
  return null;
}

function sortMenuChildren<T extends { label: string; id: number; order: number }>(
  items: T[],
  sort: SubMenuSort | undefined,
): T[] {
  const mode = sort ?? "creation";
  const sorted = [...items];
  if (mode === "alphabetical") {
    sorted.sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  } else {
    sorted.sort((a, b) => a.order - b.order || a.id - b.id);
  }
  return sorted;
}

/**
 * Groups flat menu items into a nested tree by parent_menu_item_id.
 */
export function buildMenuItemTree(flatItems: MenuItemFlatPublic[]): MenuItemPublicRaw[] {
  const byParent = new Map<number | null, MenuItemFlatPublic[]>();
  for (const item of flatItems) {
    const parentId = item.parent_menu_item_id;
    const group = byParent.get(parentId) ?? [];
    group.push(item);
    byParent.set(parentId, group);
  }

  const sortByParent = new Map<number, SubMenuSort | undefined>();
  for (const item of flatItems) {
    if (item.submenu_sort) {
      sortByParent.set(item.id, item.submenu_sort);
    }
  }

  function buildLevel(parentId: number | null): MenuItemPublicRaw[] {
    const siblings = byParent.get(parentId) ?? [];
    const sorted =
      parentId == null
        ? [...siblings].sort((a, b) => a.order - b.order || a.id - b.id)
        : sortMenuChildren(siblings, sortByParent.get(parentId));

    return sorted.map((item) => {
      const { parent_menu_item_id: _parent, order: _order, ...rest } = item;
      return {
        ...rest,
        children: buildLevel(item.id),
      };
    });
  }

  return buildLevel(null);
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
    return buildTaxonomyPublicPath(taxonomyType, slug, prefix);
  }

  return `${prefix}/${slug}`.replace(/\/+/g, "/") || `/${slug}`;
}

export function menuChildPostToFlatItem(
  row: {
    id?: number;
    title?: string | null;
    slug?: string | null;
    body?: string | null;
    meta_values?: unknown;
  },
  dbLocale: string,
): MenuItemFlatPublic | null {
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

  if (!label || !url || row.id == null) return null;

  return {
    id: row.id,
    label,
    url,
    slug: String(row.slug ?? ""),
    target_post_id:
      typeof meta["target_post_id"] === "number" ? meta["target_post_id"] : null,
    order: menuOrderFromMeta(meta),
    parent_menu_item_id: parseParentMenuItemId(meta["parent_menu_item_id"]),
    submenu_sort: parseSubMenuSort(meta["submenu_sort"]),
    submenu_display: parseSubMenuDisplay(meta["submenu_display"]),
  };
}

/** @deprecated Use menuChildPostToFlatItem for tree building. */
export function menuChildPostToLinkItem(
  row: {
    title?: string | null;
    body?: string | null;
    meta_values?: unknown;
  },
  dbLocale: string,
): { label: string; url: string } | null {
  const flat = menuChildPostToFlatItem({ ...row, id: 1, slug: "" }, dbLocale);
  if (!flat) return null;
  return { label: flat.label, url: flat.url };
}

export function menuOrderFromMeta(meta: Record<string, unknown>): number {
  const order = meta["menu_order"];
  return typeof order === "number" ? order : 9999;
}

function mapMenuItemWithActive(item: MenuItemPublicRaw, normPath: string): MenuItem {
  const urlNorm = item.url.replace(/\/+$/, "") || "/";
  return {
    id: item.id,
    label: item.label,
    url: item.url,
    slug: item.slug,
    target_post_id: item.target_post_id,
    active: item.url !== "" && normPath === urlNorm,
    submenu_sort: item.submenu_sort,
    submenu_display: item.submenu_display,
    children: (item.children ?? []).map((child) => mapMenuItemWithActive(child, normPath)),
  };
}

export function buildThemeMenusRecord(
  menusByLocation: Record<string, MenuItemPublicRaw[]>,
  currentPath: string,
): Record<string, MenuItem[]> {
  const normPath = currentPath.replace(/\/+$/, "") || "/";
  const menus: Record<string, MenuItem[]> = {};
  for (const [location, items] of Object.entries(menusByLocation)) {
    menus[location] = items.map((item) => mapMenuItemWithActive(item, normPath));
  }
  return menus;
}
