import type { AuthenticatedClient } from "../auth/handshake.ts";
import { fetchJson } from "../auth/handshake.ts";
import {
  resolveCoverImage,
  type CoverImageAttachmentCache,
} from "../engine/cover-image.ts";
import { resolveThemeSeoContext } from "../engine/seo-head.ts";
import type {
  MenuItem,
  ResolvedPublicRoute,
  ThemeAuthorView,
  ThemePackageRecord,
  ThemePostView,
  ThemeRenderContext,
  CustomFieldItem,
} from "../engine/types.ts";
import {
  localeToHtmlLang,
  publicLocaleHomeUrl,
  publicLocaleToDbCode,
  publicLocaleUrlPrefix,
} from "../engine/resolve-route.ts";
import type { RouteKindResolverDeps } from "../engine/resolve-route-kind.ts";
import { resolveThemeRoute } from "../engine/resolve-theme-route.ts";
import { filterPublicThemeListPosts, isMenuLocationContainer } from "../engine/post-filters.ts";
import {
  buildMenuItemTree,
  buildThemeMenusRecord,
  menuChildPostToFlatItem,
} from "../engine/menu-items-url.ts";
import {
  filterArchivablePostTypes,
  resolveArchivePostTypeFromRoute,
} from "../engine/post-type-routes.ts";
import { buildMockContext } from "./mock-context.ts";
import { buildLocaleSwitcher } from "../engine/locale-switcher.ts";
import {
  createConnectTaxonomyTranslationResolver,
  type TaxonomyTranslationResolver,
} from "../engine/taxonomy-translation-client.ts";
import { buildBodyClass } from "../engine/body-class.ts";
import {
  createGetTaxonomiesHandler,
  createGetTaxonomiesLocaleHandler,
  createGetRelatedPostsHandler,
  createGetTaxonomyPostsHandler,
  createGetPostsHandler,
  createGetAuthorHandler,
  filterLeafTaxonomyItems,
  isTaxonomyAllowedForPostType,
} from "../engine/theme-functions.ts";
import {
  buildRelatedPostsCacheKey,
  devRelatedPostsCache,
  isNumericPostIdentifier,
} from "../engine/related-posts-cache.ts";
import { buildAuthorCacheKey, devAuthorCache } from "../engine/author-cache.ts";
import { injectCategoryMeta } from "../engine/post-category-meta.ts";
import { injectCustomFieldsMeta } from "../engine/custom-fields-meta.ts";

type ApiListResponse<T> = {
  items?: T[];
  total?: number;
  page?: number;
  limit?: number;
};

type ApiPostRow = {
  id?: number;
  title?: string;
  slug?: string;
  excerpt?: string | null;
  body?: string | null;
  body_blocks?: string | null;
  author_id?: string | null;
  author_name?: string;
  published_at?: number | string | null;
  post_type_slug?: string;
  post_types_slug?: string;
  status?: string;
  parent_id?: number | null;
  meta_values?: Record<string, unknown>;
  media?: Array<{ id?: number; meta_values?: Record<string, unknown> }>;
  seo?: { title?: string; description?: string; canonical?: string } | null;
  json_ld?: Record<string, unknown>[] | null;
  custom_fields?: CustomFieldItem[];
  taxonomies?: Array<{ id?: number; slug?: string; type?: string; name?: string }>;
};

function withPostsListIncludes(path: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}include=custom_fields`;
}

type SiteResponse = {
  site_name?: string;
  site_description?: string;
  site_url?: string;
  json_ld?: Record<string, unknown> | Record<string, unknown>[];
};

function parseAttachmentMeta(meta: unknown): Record<string, unknown> {
  if (meta && typeof meta === "object") return meta as Record<string, unknown>;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function mapPost(row: ApiPostRow, baseUrl: string): ThemePostView {
  const meta: Record<string, string> = {};
  if (row.meta_values && typeof row.meta_values === "object") {
    for (const [k, v] of Object.entries(row.meta_values)) {
      if (v != null) meta[k] = String(v);
    }
  }

  injectCategoryMeta(meta, row.taxonomies);

  const customFields = Array.isArray(row.custom_fields) ? row.custom_fields : [];
  injectCustomFieldsMeta(meta, customFields);

  return {
    id: Number(row.id ?? 0),
    title: String(row.title ?? ""),
    slug: String(row.slug ?? ""),
    excerpt: String(row.excerpt ?? ""),
    body_html: String(row.body ?? ""),
    body_blocks: row.body_blocks ?? null,
    author_name: String(row.author_name ?? ""),
    published_at:
      typeof row.published_at === "number"
        ? row.published_at
        : row.published_at
          ? Date.parse(String(row.published_at))
          : null,
    post_type_slug: String(row.post_type_slug ?? "post"),
    meta,
    custom_fields: customFields,
  };
}

function withLocaleQuery(path: string, dbLocale: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}locale=${encodeURIComponent(dbLocale)}`;
}

function buildArchivePageUrl(pathname: string, page: number): string {
  const url = new URL(pathname, "http://localhost");
  if (page <= 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(page));
  }
  const qs = url.searchParams.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}

function buildSearchPageUrl(pathname: string, q: string, page: number, postType?: string): string {
  const url = new URL(pathname, "http://localhost");
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  if (postType) url.searchParams.set("post_type", postType);
  else url.searchParams.delete("post_type");
  if (page <= 1) url.searchParams.delete("page");
  else url.searchParams.set("page", String(page));
  const qs = url.searchParams.toString();
  return `${url.pathname}${qs ? `?${qs}` : ""}`;
}

function toSeoPostInput(row: ApiPostRow, post: ThemePostView) {
  return {
    title: post.title,
    excerpt: post.excerpt,
    body: post.body_html,
    post_type_slug: post.post_type_slug,
    seo: row.seo ?? null,
    json_ld: row.json_ld ?? null,
  };
}

async function enrichApiPost(
  row: ApiPostRow,
  baseUrl: string,
  client: AuthenticatedClient,
  cache: CoverImageAttachmentCache,
  dbLocale: string,
): Promise<ThemePostView> {
  const view = mapPost(row, baseUrl);
  const cover = await resolveCoverImage(
    { meta_values: row.meta_values, media: row.media },
    baseUrl,
    cache,
    async (id) => {
      const attachment = await fetchJson<ApiPostRow>(
        client,
        withLocaleQuery(`/api/content/posts/${id}`, dbLocale),
      ).catch(() => null);
      if (!attachment) return null;
      return parseAttachmentMeta(attachment.meta_values);
    },
  );
  return cover ? { ...view, cover_image: cover } : view;
}

async function mapPublicListPosts(
  rows: ApiPostRow[],
  baseUrl: string,
  client: AuthenticatedClient,
  cache: CoverImageAttachmentCache,
  dbLocale: string,
): Promise<ThemePostView[]> {
  const normalized = rows.map((row) => ({
    ...row,
    status: row.status ?? "published",
  }));
  const filtered = filterPublicThemeListPosts(normalized);
  return Promise.all(filtered.map((row) => enrichApiPost(row, baseUrl, client, cache, dbLocale)));
}

function inferRouteKind(route: ResolvedPublicRoute, post?: ThemePostView): ThemeRenderContext["route"]["kind"] {
  if (route.kind === "home") return "home";
  if (route.kind === "archive") return "archive";
  if (route.kind === "taxonomy") return "taxonomy";
  if (route.kind === "404") return "404";
  if (post?.post_type_slug === "page") return "page";
  return "single";
}

async function fetchTaxonomyTypes(client: AuthenticatedClient): Promise<string[]> {
  try {
    const list = await fetchJson<ApiListResponse<ApiTaxonomyRow>>(
      client,
      "/api/content/taxonomies?limit=500",
    );
    const types = new Set<string>();
    for (const item of list.items ?? []) {
      const type = String(item.type ?? "").trim();
      if (type) types.add(type);
    }
    return [...types];
  } catch {
    return ["category", "tag"];
  }
}

async function createConnectRouteKindDeps(
  client: AuthenticatedClient,
  dbLocale: string,
  taxonomyResolver: TaxonomyTranslationResolver,
): Promise<RouteKindResolverDeps> {
  const [archivablePostTypes, taxonomyTypes] = await Promise.all([
    fetchArchivablePostTypes(client),
    fetchTaxonomyTypes(client),
  ]);
  return {
    archivablePostTypes,
    taxonomyTypes,
    resolvePostBySlug: async (slug) => {
      try {
        const detail = await fetchJson<ApiPostRow>(
          client,
          withLocaleQuery(`/api/content/posts/${encodeURIComponent(slug)}`, dbLocale),
        );
        return { post_type_slug: String(detail.post_type_slug ?? detail.post_types_slug ?? "page") };
      } catch {
        return null;
      }
    },
    resolveTaxonomyTerm: async (taxonomyType, termSlug) => {
      const term = await taxonomyResolver.resolveTermBySlug(taxonomyType, termSlug);
      if (!term) return null;
      const localized = await taxonomyResolver.localizeTerm(term);
      return { slug: localized.slug };
    },
  };
}

async function fetchArchivablePostTypes(client: AuthenticatedClient) {
  try {
    const list = await fetchJson<ApiListResponse<{ slug?: string; name?: string }>>(
      client,
      "/api/content/post_types?limit=100",
    );
    const types = filterArchivablePostTypes(list.items ?? []);
    return types.length > 0 ? types : [{ slug: "post", name: "Post" }];
  } catch {
    return [{ slug: "post", name: "Post" }];
  }
}

async function fetchArchivePosts(
  client: AuthenticatedClient,
  postType: string,
  page: number,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
): Promise<{ posts: ThemePostView[]; total: number; limit: number }> {
  const list = await fetchJson<ApiListResponse<ApiPostRow>>(
    client,
    withLocaleQuery(
      `/api/content/posts?page=${page}&limit=10&order=published_at&orderDir=desc&filter_post_type=${encodeURIComponent(postType)}&filter_status=published`,
      dbLocale,
    ),
  );
  const posts = await mapPublicListPosts(list.items ?? [], client.origin, client, attachmentCache, dbLocale);
  return {
    posts,
    total: list.total ?? posts.length,
    limit: list.limit ?? 10,
  };
}

async function applyArchiveContext(
  base: ThemeRenderContext,
  route: ResolvedPublicRoute,
  archive: { postType: string; title: string },
  posts: ThemePostView[],
  page: number,
  total: number,
  limit: number,
  origin: string,
  siteName: string,
  siteDescription: string,
): Promise<void> {
  base.posts = posts.length > 0 ? posts : base.posts;
  base.have_posts = base.posts.length > 0;
  base.route.kind = "archive";
  base.is_archive = true;
  base.is_search = false;
  base.is_front_page = false;
  base.is_single = false;
  base.is_page = false;
  base.is_singular = false;
  base.post = undefined;
  base.archive = { title: archive.title, type: archive.postType };
  const totalPages = Math.max(1, Math.ceil(total / limit));
  base.pagination = {
    page,
    total_pages: totalPages,
    ...(page > 1 ? { prev_url: buildArchivePageUrl(route.path, page - 1) } : {}),
    ...(page < totalPages ? { next_url: buildArchivePageUrl(route.path, page + 1) } : {}),
  };
  base.seo = resolveThemeSeoContext({
    resolvedKind: "archive",
    isArchiveRoute: true,
    archiveTitle: archive.title,
    homeListPosts: false,
    siteName,
    siteDescription,
    canonicalUrl: `${origin}${route.path}`,
    ...(posts[0]?.cover_image ? { ogImage: posts[0].cover_image } : {}),
  });
  base.body_class = buildBodyClass(route, undefined, "archive");
  base.locale_switcher = await buildLocaleSwitcher(route.locale, route, "archive", {
    archivePostType: archive.postType,
  });
}

type ApiTaxonomyTerm = {
  id?: number;
  name?: string;
  slug?: string;
  type?: string;
};

async function fetchTaxonomyArchivePosts(
  client: AuthenticatedClient,
  taxonomyType: string,
  termSlug: string,
  page: number,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
): Promise<{ posts: ThemePostView[]; total: number; limit: number }> {
  const limit = 10;
  const order = "published_at";
  const list = await fetchJson<ApiListResponse<ApiPostRow>>(
    client,
    withLocaleQuery(
      `/api/content/posts?page=${page}&limit=${limit}&order=${order}&orderDir=desc&filter_status=published&filter_taxonomy_type=${encodeURIComponent(taxonomyType)}&filter_taxonomy_slug=${encodeURIComponent(termSlug)}`,
      dbLocale,
    ),
  );
  const posts = await mapPublicListPosts(list.items ?? [], client.origin, client, attachmentCache, dbLocale);
  return {
    posts,
    total: list.total ?? posts.length,
    limit: list.limit ?? 10,
  };
}

async function applyTaxonomyContext(
  base: ThemeRenderContext,
  route: ResolvedPublicRoute,
  term: ApiTaxonomyTerm,
  localized: { name: string; slug: string },
  posts: ThemePostView[],
  page: number,
  total: number,
  limit: number,
  origin: string,
  siteName: string,
  siteDescription: string,
  taxonomyResolver: TaxonomyTranslationResolver,
): Promise<void> {
  const termName = localized.name || String(term.name ?? route.taxonomySlug ?? "");
  const localizedSlug = localized.slug || String(term.slug ?? route.taxonomySlug ?? "");
  const canonicalSlug = String(term.slug ?? "");
  base.posts = posts.length > 0 ? posts : base.posts;
  base.have_posts = base.posts.length > 0;
  base.route.kind = "taxonomy";
  base.route.taxonomy_type = route.taxonomyType;
  base.route.taxonomy_slug = localizedSlug;
  base.is_archive = true;
  base.is_search = false;
  base.is_front_page = false;
  base.is_single = false;
  base.is_page = false;
  base.is_singular = false;
  base.is_404 = false;
  base.post = undefined;
  base.archive = { title: termName, type: route.taxonomyType ?? "category" };
  const totalPages = Math.max(1, Math.ceil(total / limit));
  base.pagination = {
    page,
    total_pages: totalPages,
    ...(page > 1 ? { prev_url: buildArchivePageUrl(route.path, page - 1) } : {}),
    ...(page < totalPages ? { next_url: buildArchivePageUrl(route.path, page + 1) } : {}),
  };
  base.seo = resolveThemeSeoContext({
    resolvedKind: "taxonomy",
    isArchiveRoute: true,
    archiveTitle: termName,
    homeListPosts: false,
    siteName,
    siteDescription,
    canonicalUrl: `${origin}${route.path}`,
    ...(posts[0]?.cover_image ? { ogImage: posts[0].cover_image } : {}),
  });
  const taxonomyMeta =
    route.taxonomyType && localizedSlug
      ? { type: route.taxonomyType, slug: localizedSlug }
      : undefined;
  base.body_class = buildBodyClass(route, undefined, "taxonomy", taxonomyMeta);
  base.locale_switcher = await buildLocaleSwitcher(route.locale, route, "taxonomy", {
    taxonomyCanonicalSlug: canonicalSlug,
    resolveLocalizedTaxonomySlug: (slug, locale) =>
      taxonomyResolver.getLocalizedSlug(slug, locale),
  });
}

async function applyNotFoundContext(
  base: ThemeRenderContext,
  route: ResolvedPublicRoute,
  origin: string,
): Promise<void> {
  base.route.kind = "404";
  base.is_404 = true;
  base.is_search = false;
  base.is_archive = false;
  base.is_front_page = false;
  base.is_single = false;
  base.is_page = false;
  base.is_singular = false;
  base.post = undefined;
  base.posts = [];
  base.have_posts = false;
  base.archive = { title: "Blog", type: "post" };
  base.pagination = { page: 1, total_pages: 1 };
  base.seo = resolveThemeSeoContext({
    resolvedKind: "404",
    isArchiveRoute: false,
    archiveTitle: "Blog",
    homeListPosts: false,
    siteName: base.site.title,
    siteDescription: base.site.description,
    canonicalUrl: `${origin}${route.path}`,
  });
  base.body_class = buildBodyClass(route, undefined, "404");
  base.locale_switcher = await buildLocaleSwitcher(route.locale, route, "404");
}

async function fetchSearchResults(
  client: AuthenticatedClient,
  q: string,
  page: number,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
  postType?: string,
): Promise<{
  posts: ThemePostView[];
  total: number;
  limit: number;
  totalPages: number;
  page: number;
}> {
  const trimmed = q.trim();
  if (!trimmed) {
    return { posts: [], total: 0, limit: 20, totalPages: 0, page: 1 };
  }

  const params = new URLSearchParams({
    q: trimmed,
    locale: dbLocale,
    page: String(page),
    limit: "20",
  });
  if (postType) params.set("post_type", postType);

  const data = await fetchJson<{
    items?: ApiPostRow[];
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  }>(client, `/api/search?${params.toString()}`);

  const posts = await mapPublicListPosts(
    data.items ?? [],
    client.origin,
    client,
    attachmentCache,
    dbLocale,
  );

  return {
    posts,
    total: data.total ?? posts.length,
    limit: data.limit ?? 20,
    totalPages: data.totalPages ?? 0,
    page: data.page ?? page,
  };
}

async function applySearchContext(
  base: ThemeRenderContext,
  route: ResolvedPublicRoute,
  q: string,
  posts: ThemePostView[],
  page: number,
  total: number,
  limit: number,
  totalPages: number,
  origin: string,
  siteName: string,
  siteDescription: string,
  postType?: string,
): Promise<void> {
  const archiveTitle = q ? `Busca: ${q}` : "Busca";
  base.posts = posts;
  base.have_posts = posts.length > 0;
  base.route.kind = "search";
  base.is_search = true;
  base.is_archive = false;
  base.is_front_page = false;
  base.is_single = false;
  base.is_page = false;
  base.is_singular = false;
  base.is_404 = false;
  base.post = undefined;
  base.search = { query: q, total };
  base.archive = { title: archiveTitle, type: "search" };
  const pages = Math.max(1, totalPages || 1);
  base.pagination = {
    page,
    total_pages: pages,
    ...(page > 1 && totalPages > 0
      ? { prev_url: buildSearchPageUrl(route.path, q, page - 1, postType) }
      : {}),
    ...(page < totalPages
      ? { next_url: buildSearchPageUrl(route.path, q, page + 1, postType) }
      : {}),
  };
  const canonicalUrl = new URL(
    buildSearchPageUrl(route.path, q, page, postType),
    origin,
  ).href;
  base.seo = resolveThemeSeoContext({
    resolvedKind: "search",
    isArchiveRoute: true,
    archiveTitle,
    homeListPosts: false,
    siteName,
    siteDescription,
    canonicalUrl,
    ...(posts[0]?.cover_image ? { ogImage: posts[0].cover_image } : {}),
  });
  base.body_class = buildBodyClass(route, undefined, "search");
  base.locale_switcher = await buildLocaleSwitcher(route.locale, route, "search");
}

type ApiTaxonomyRow = {
  id?: number;
  name?: string;
  slug?: string;
  type?: string;
  parent_id?: number | null;
};

async function fetchMenusByLocation(
  client: AuthenticatedClient,
  dbLocale: string,
  currentPath: string,
): Promise<Record<string, MenuItem[]>> {
  try {
    const list = await fetchJson<ApiListResponse<ApiPostRow>>(
      client,
      withLocaleQuery(
        "/api/content/posts?limit=500&filter_post_type=menus&filter_status=published",
        dbLocale,
      ),
    );

    const parents: ApiPostRow[] = [];
    const children: ApiPostRow[] = [];

    for (const row of list.items ?? []) {
      const parentId = row.parent_id;
      if (parentId == null || parentId === 0) {
        if (isMenuLocationContainer(row)) {
          parents.push(row);
        }
      } else {
        children.push(row);
      }
    }

    const slugByParentId = new Map<number, string>();
    for (const parent of parents) {
      if (parent.id != null) {
        slugByParentId.set(parent.id, String(parent.slug ?? "").trim());
      }
    }

    const byLocation: Record<string, import("../engine/menu-items-url.ts").MenuItemFlatPublic[]> = {};

    for (const row of children) {
      const parentId = row.parent_id;
      if (parentId == null) continue;
      const location = slugByParentId.get(parentId);
      if (!location) continue;

      const item = menuChildPostToFlatItem(row, dbLocale);
      if (!item) continue;

      if (!byLocation[location]) byLocation[location] = [];
      byLocation[location].push(item);
    }

    const menusByLocation: Record<string, import("../engine/menu-items-url.ts").MenuItemPublicRaw[]> = {};
    for (const [location, flatItems] of Object.entries(byLocation)) {
      menusByLocation[location] = buildMenuItemTree(flatItems);
    }

    return buildThemeMenusRecord(menusByLocation, currentPath);
  } catch {
    return {};
  }
}

async function fetchTaxonomiesForPostType(
  client: AuthenticatedClient,
  postType: string,
  taxonomyType: string,
  dbLocale: string,
): Promise<ApiTaxonomyRow[]> {
  try {
    // filter_slug uses SQL LIKE on the CMS API, so filter_slug=post matches post_type first.
    const postTypes = await fetchJson<ApiListResponse<{ slug?: string; meta_schema?: unknown }>>(
      client,
      "/api/content/post_types?limit=100",
    );
    const pt = postTypes.items?.find((item) => item.slug === postType);
    if (!pt || !isTaxonomyAllowedForPostType(pt.meta_schema, taxonomyType)) {
      return [];
    }

    const taxonomies = await fetchJson<ApiListResponse<ApiTaxonomyRow>>(
      client,
      withLocaleQuery(
        `/api/content/taxonomies?filter_type=${encodeURIComponent(taxonomyType)}&limit=500`,
        dbLocale,
      ),
    );
    return filterLeafTaxonomyItems(taxonomies.items ?? []);
  } catch {
    return [];
  }
}

function attachGetTaxonomiesHandler(
  ctx: ThemeRenderContext,
  client: AuthenticatedClient,
  dbLocale: string,
  taxonomyResolver: TaxonomyTranslationResolver,
): void {
  ctx.get_taxonomies = createGetTaxonomiesHandler(async (postType, taxonomyType) => {
    const items = await fetchTaxonomiesForPostType(client, postType, taxonomyType, dbLocale);
    return taxonomyResolver.localizeTerms(
      items.map((item) => ({
        id: item.id,
        name: String(item.name ?? ""),
        slug: String(item.slug ?? ""),
        type: taxonomyType,
      })),
    );
  });
}

function attachGetTaxonomiesLocaleHandler(
  ctx: ThemeRenderContext,
  client: AuthenticatedClient,
): void {
  ctx.get_taxonomies_locale = createGetTaxonomiesLocaleHandler(async (postType, taxonomyType, locale) => {
    const localeResolver = createConnectTaxonomyTranslationResolver(client, locale);
    const items = await fetchTaxonomiesForPostType(client, postType, taxonomyType, locale);
    const [taxonomy, localized] = await Promise.all([
      localeResolver.localizeTaxonomyType(taxonomyType),
      localeResolver.localizeTerms(
        items.map((item) => ({
          id: item.id,
          name: String(item.name ?? ""),
          slug: String(item.slug ?? ""),
          type: taxonomyType,
        })),
      ),
    ]);
    return {
      taxonomy,
      values: localized.map((term) => ({
        id: term.id ?? 0,
        name: term.name,
        slug: term.slug,
        locale,
      })),
    };
  });
}

async function fetchSourcePostForRelated(
  client: AuthenticatedClient,
  idOrSlug: string | number,
  dbLocale: string,
): Promise<ApiPostRow | null> {
  try {
    if (isNumericPostIdentifier(idOrSlug)) {
      return await fetchJson<ApiPostRow>(
        client,
        withLocaleQuery(`/api/content/posts/${idOrSlug}`, dbLocale),
      );
    }
    return await fetchJson<ApiPostRow>(
      client,
      withLocaleQuery(`/api/content/posts/${encodeURIComponent(String(idOrSlug))}`, dbLocale),
    );
  } catch {
    return null;
  }
}

async function fetchRelatedPostsViaApi(
  client: AuthenticatedClient,
  idOrSlug: string | number,
  limit: number,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
): Promise<ThemePostView[]> {
  const sourcePost = await fetchSourcePostForRelated(client, idOrSlug, dbLocale);
  const sourceId = Number(sourcePost?.id ?? 0);
  if (!sourceId) return [];

  const cacheKey = buildRelatedPostsCacheKey({
    postId: sourceId,
    localeCode: dbLocale,
    limit,
  });

  const cachedIds = devRelatedPostsCache.get(cacheKey);
  if (cachedIds) {
    if (cachedIds.length === 0) return [];
    const views: ThemePostView[] = [];
    for (const id of cachedIds) {
      try {
        const row = await fetchJson<ApiPostRow>(
          client,
          withLocaleQuery(`/api/content/posts/${id}`, dbLocale),
        );
        views.push(await enrichApiPost(row, client.origin, client, attachmentCache, dbLocale));
      } catch {
        // skip missing post
      }
    }
    return views;
  }

  const categories = (sourcePost?.taxonomies ?? []).filter((term) => term.type === "category");
  if (categories.length === 0) {
    devRelatedPostsCache.set(cacheKey, []);
    return [];
  }

  const merged = new Map<number, ThemePostView>();
  for (const category of categories) {
    const slug = String(category.slug ?? "").trim();
    if (!slug) continue;
    try {
      const list = await fetchJson<ApiListResponse<ApiPostRow>>(
        client,
        withLocaleQuery(
          withPostsListIncludes(
            `/api/content/posts?limit=${limit}&order=published_at&orderDir=desc&filter_status=published&filter_taxonomy_type=category&filter_taxonomy_slug=${encodeURIComponent(slug)}`,
          ),
          dbLocale,
        ),
      );
      const posts = await mapPublicListPosts(
        list.items ?? [],
        client.origin,
        client,
        attachmentCache,
        dbLocale,
      );
      for (const post of posts) {
        if (post.id !== sourceId) merged.set(post.id, post);
      }
    } catch {
      // skip category fetch errors
    }
  }

  const sorted = [...merged.values()].sort(
    (a, b) => (b.published_at ?? 0) - (a.published_at ?? 0),
  );
  const result = sorted.slice(0, limit);
  devRelatedPostsCache.set(
    cacheKey,
    result.map((post) => post.id),
  );
  return result;
}

async function fetchTaxonomyPostsViaApi(
  client: AuthenticatedClient,
  taxonomyType: string,
  taxonomySlug: string,
  limit: number,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
  taxonomyResolver: TaxonomyTranslationResolver,
): Promise<ThemePostView[]> {
  try {
    const canonicalSlug = await taxonomyResolver.resolveCanonicalSlugForFilter(
      taxonomyType,
      taxonomySlug,
    );
    if (!canonicalSlug) return [];

    const list = await fetchJson<ApiListResponse<ApiPostRow>>(
      client,
      withLocaleQuery(
        withPostsListIncludes(
          `/api/content/posts?limit=${limit}&order=order&orderDir=desc&filter_status=published&filter_taxonomy_type=${encodeURIComponent(taxonomyType)}&filter_taxonomy_slug=${encodeURIComponent(canonicalSlug)}`,
        ),
        dbLocale,
      ),
    );
    return mapPublicListPosts(
      list.items ?? [],
      client.origin,
      client,
      attachmentCache,
      dbLocale,
    );
  } catch {
    return [];
  }
}

async function fetchPostsByTypeViaApi(
  client: AuthenticatedClient,
  postTypeSlug: string,
  limit: number,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
  includeCustomFields = false,
): Promise<ThemePostView[]> {
  try {
    const basePath = `/api/content/posts?limit=${limit}&order=order&orderDir=desc&filter_status=published&filter_post_type=${encodeURIComponent(postTypeSlug)}`;
    const list = await fetchJson<ApiListResponse<ApiPostRow>>(
      client,
      withLocaleQuery(
        includeCustomFields ? withPostsListIncludes(basePath) : basePath,
        dbLocale,
      ),
    );
    return mapPublicListPosts(
      list.items ?? [],
      client.origin,
      client,
      attachmentCache,
      dbLocale,
    );
  } catch {
    return [];
  }
}

function attachGetRelatedPostsHandler(
  ctx: ThemeRenderContext,
  client: AuthenticatedClient,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
): void {
  ctx.get_related_posts = createGetRelatedPostsHandler(async (idOrSlug, limit) =>
    fetchRelatedPostsViaApi(client, idOrSlug, limit, dbLocale, attachmentCache),
  );
}

function attachGetTaxonomyPostsHandler(
  ctx: ThemeRenderContext,
  client: AuthenticatedClient,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
  taxonomyResolver: TaxonomyTranslationResolver,
): void {
  ctx.get_taxonomy_posts = createGetTaxonomyPostsHandler(
    async (taxonomyType, taxonomySlug, limit) =>
      fetchTaxonomyPostsViaApi(
        client,
        taxonomyType,
        taxonomySlug,
        limit,
        dbLocale,
        attachmentCache,
        taxonomyResolver,
      ),
  );
}

function attachGetPostsHandler(
  ctx: ThemeRenderContext,
  client: AuthenticatedClient,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
): void {
  ctx.get_posts = createGetPostsHandler(async (postTypeSlug, limit) =>
    fetchPostsByTypeViaApi(client, postTypeSlug, limit, dbLocale, attachmentCache, false),
  );
}

function attachGetPostsDetailsHandler(
  ctx: ThemeRenderContext,
  client: AuthenticatedClient,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
): void {
  ctx.get_posts_details = createGetPostsHandler(async (postTypeSlug, limit) =>
    fetchPostsByTypeViaApi(client, postTypeSlug, limit, dbLocale, attachmentCache, true),
  );
}

async function fetchAuthorViaApi(
  client: AuthenticatedClient,
  idOrSlug: string | number,
  dbLocale: string,
): Promise<ThemeAuthorView | null> {
  const sourcePost = await fetchSourcePostForRelated(client, idOrSlug, dbLocale);
  const authorId = sourcePost?.author_id != null ? String(sourcePost.author_id).trim() : "";
  if (!authorId) return null;

  const cacheKey = buildAuthorCacheKey(authorId);
  const cached = devAuthorCache.get(cacheKey);
  if (cached) return cached;

  try {
    const author = await fetchJson<ThemeAuthorView>(
      client,
      `/api/content/authors/${encodeURIComponent(authorId)}`,
    );
    devAuthorCache.set(cacheKey, author);
    return author;
  } catch {
    return null;
  }
}

function attachGetAuthorHandler(
  ctx: ThemeRenderContext,
  client: AuthenticatedClient,
  dbLocale: string,
): void {
  ctx.get_author = createGetAuthorHandler(async (idOrSlug) =>
    fetchAuthorViaApi(client, idOrSlug, dbLocale),
  );
}

export async function buildConnectedContext(
  client: AuthenticatedClient,
  url: URL,
  pathname: string,
  searchParams: URLSearchParams,
  pkg: ThemePackageRecord,
): Promise<ThemeRenderContext> {
  const dbLocale = publicLocaleToDbCode(pathname.startsWith("/en") ? "en" : "pt-br");
  const taxonomyResolver = createConnectTaxonomyTranslationResolver(client, dbLocale);
  const templateKeys = Object.keys(pkg.templates);
  const routeDeps = await createConnectRouteKindDeps(client, dbLocale, taxonomyResolver);
  const route = await resolveThemeRoute(pathname, searchParams, templateKeys, routeDeps);
  const base = await buildMockContext(url, pathname, searchParams, pkg, route);
  const attachmentCache: CoverImageAttachmentCache = new Map();
  attachGetTaxonomiesHandler(base, client, dbLocale, taxonomyResolver);
  attachGetTaxonomiesLocaleHandler(base, client);
  attachGetRelatedPostsHandler(base, client, dbLocale, attachmentCache);
  attachGetTaxonomyPostsHandler(base, client, dbLocale, attachmentCache, taxonomyResolver);
  attachGetPostsHandler(base, client, dbLocale, attachmentCache);
  attachGetPostsDetailsHandler(base, client, dbLocale, attachmentCache);
  attachGetAuthorHandler(base, client, dbLocale);

  try {
    const [site, settings] = await Promise.all([
      fetchJson<SiteResponse>(client, "/api/content/site"),
      fetchJson<Record<string, string>>(client, "/api/settings?names=site_name,site_description"),
    ]);

    const siteName = String(settings.site_name ?? site.site_name ?? base.site.title).trim() || base.site.title;
    const siteDescription = String(settings.site_description ?? site.site_description ?? "").trim();
    const homeContentKey = pkg.manifest.home_content_key ?? "hello-world";
    const homeListPosts = pkg.manifest.home_list_posts === true;

    base.site.title = siteName;
    base.site.description = siteDescription;

    const [archivableTypes, menus] = await Promise.all([
      fetchArchivablePostTypes(client),
      fetchMenusByLocation(client, dbLocale, route.path),
    ]);
    if (Object.keys(menus).length > 0) {
      base.menus = { ...base.menus, ...menus };
    }

    if (route.kind === "search") {
      const q = route.searchQuery ?? "";
      const page = route.page ?? 1;
      const postType = url.searchParams.get("post_type")?.trim() || undefined;
      const { posts, total, limit, totalPages } = await fetchSearchResults(
        client,
        q,
        page,
        dbLocale,
        attachmentCache,
        postType,
      );
      await applySearchContext(
        base,
        route,
        q,
        posts,
        page,
        total,
        limit,
        totalPages,
        client.origin,
        siteName,
        siteDescription,
        postType,
      );
      return base;
    }

    if (route.kind === "taxonomy" && route.taxonomyType && route.taxonomySlug) {
      const page = route.page ?? 1;
      const term = await taxonomyResolver.resolveTermBySlug(
        route.taxonomyType,
        route.taxonomySlug,
      );
      if (!term) {
        await applyNotFoundContext(base, route, client.origin);
        return base;
      }
      const localized = await taxonomyResolver.localizeTerm(term);
      const { posts, total, limit } = await fetchTaxonomyArchivePosts(
        client,
        route.taxonomyType,
        term.slug,
        page,
        dbLocale,
        attachmentCache,
      );
      await applyTaxonomyContext(
        base,
        route,
        term,
        localized,
        posts,
        page,
        total,
        limit,
        client.origin,
        siteName,
        siteDescription,
        taxonomyResolver,
      );
      return base;
    }

    const archiveRoute =
      route.kind === "archive" && route.postType
        ? {
            postType: route.postType,
            title:
              archivableTypes.find((type) => type.slug === route.postType)?.name ??
              (route.postType === "post" ? "Blog" : route.postType),
          }
        : resolveArchivePostTypeFromRoute(route, archivableTypes);

    if (archiveRoute) {
      const page = route.page ?? 1;
      const { posts, total, limit } = await fetchArchivePosts(
        client,
        archiveRoute.postType,
        page,
        dbLocale,
        attachmentCache,
      );
      await applyArchiveContext(
        base,
        route,
        archiveRoute,
        posts,
        page,
        total,
        limit,
        client.origin,
        siteName,
        siteDescription,
      );
      return base;
    }

    if (route.slug && route.kind !== "home") {
      const detail = await fetchJson<ApiPostRow>(
        client,
        withLocaleQuery(`/api/content/posts/${encodeURIComponent(route.slug)}`, dbLocale),
      );
      const post = await enrichApiPost(detail, client.origin, client, attachmentCache, dbLocale);
      const kind = inferRouteKind(route, post);

      base.post = post;
      base.posts = [post];
      base.route.kind = kind;
      base.is_front_page = false;
      base.is_single = kind === "single";
      base.is_page = kind === "page";
      base.is_singular = kind === "single" || kind === "page";
      base.is_archive = false;
      base.is_search = false;
      base.is_404 = false;
      base.have_posts = true;

      base.seo = resolveThemeSeoContext({
        resolvedKind: kind,
        isArchiveRoute: false,
        archiveTitle: "Blog",
        homeListPosts: false,
        seoPost: toSeoPostInput(detail, post),
        siteName,
        siteDescription,
        canonicalUrl: `${client.origin}${route.path}`,
        ...(post.cover_image ? { ogImage: post.cover_image } : {}),
      });
      base.body_class = buildBodyClass(route, post, kind);
      base.locale_switcher = await buildLocaleSwitcher(route.locale, route, kind);
      return base;
    }

    if (route.kind === "home") {
      const list = await fetchJson<ApiListResponse<ApiPostRow>>(
        client,
        withLocaleQuery(
          "/api/content/posts?limit=20&order=published_at&orderDir=desc&filter_post_type=post&filter_status=published",
          dbLocale,
        ),
      );
      const posts = await mapPublicListPosts(list.items ?? [], client.origin, client, attachmentCache, dbLocale);
      base.posts = posts;
      base.have_posts = posts.length > 0;

      let post: ThemePostView | undefined;
      let seoPost: ApiPostRow | undefined;

      if (!homeListPosts) {
        try {
          const homeDetail = await fetchJson<ApiPostRow>(
            client,
            withLocaleQuery(
              `/api/content/posts/${encodeURIComponent(homeContentKey)}?resolve=translation_key`,
              dbLocale,
            ),
          );
          seoPost = homeDetail;
          post = await enrichApiPost(homeDetail, client.origin, client, attachmentCache, dbLocale);
          base.post = post;
        } catch {
          base.post = undefined;
        }
      } else {
        base.post = undefined;
      }

      const seoOgImage = seoPost
        ? (
            await resolveCoverImage(
              { meta_values: seoPost.meta_values, media: seoPost.media },
              client.origin,
              attachmentCache,
              async (id) => {
                const attachment = await fetchJson<ApiPostRow>(
                  client,
                  withLocaleQuery(`/api/content/posts/${id}`, dbLocale),
                ).catch(() => null);
                if (!attachment) return null;
                return parseAttachmentMeta(attachment.meta_values);
              },
            )
          ) ?? undefined
        : homeListPosts && posts[0]?.cover_image
          ? posts[0].cover_image
          : undefined;

      base.seo = resolveThemeSeoContext({
        resolvedKind: "home",
        isArchiveRoute: false,
        archiveTitle: "Blog",
        homeListPosts,
        ...(seoPost && post ? { seoPost: toSeoPostInput(seoPost, post) } : {}),
        siteName,
        siteDescription,
        canonicalUrl: `${client.origin}${publicLocaleHomeUrl(route.locale)}`,
        ...(seoOgImage ? { ogImage: seoOgImage } : {}),
      });
      if (site.json_ld) {
        const jsonLd = Array.isArray(site.json_ld) ? site.json_ld : [site.json_ld];
        base.seo.json_ld_html = `<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd)}</script>`;
      }
      base.body_class = buildBodyClass(route, post, "home");
      base.locale_switcher = await buildLocaleSwitcher(route.locale, route, "home");
      base.is_front_page = true;
      return base;
    }

    base.site.html_lang = localeToHtmlLang(route.locale);
    base.site.locale_prefix = publicLocaleUrlPrefix(route.locale);
    base.site.home_url = publicLocaleHomeUrl(route.locale);
    return base;
  } catch (err) {
    console.warn(
      `[edgepress] Connected mode partial fallback: ${err instanceof Error ? err.message : String(err)}`,
    );
    return base;
  }
}
