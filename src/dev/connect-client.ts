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
} from "../engine/types.ts";
import {
  localeToHtmlLang,
  publicLocaleHomeUrl,
  publicLocaleToDbCode,
  publicLocaleUrlPrefix,
} from "../engine/resolve-route.ts";
import { filterPublicThemeListPosts, isMenuLocationContainer } from "../engine/post-filters.ts";
import {
  buildThemeMenusRecord,
  menuChildPostToLinkItem,
  menuOrderFromMeta,
  parsePostMetaValues,
} from "../engine/menu-items-url.ts";
import {
  filterArchivablePostTypes,
  resolveArchivePostTypeFromRoute,
} from "../engine/post-type-routes.ts";
import { buildMockContext } from "./mock-context.ts";
import { buildLocaleSwitcher } from "../engine/locale-switcher.ts";
import {
  createGetTaxonomiesHandler,
  createGetRelatedPostsHandler,
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

type CustomFieldRow = { name?: string; value?: string; type?: string };
type CustomFieldItem = { title?: string; fields?: CustomFieldRow[] };

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
  };
}

function withLocaleQuery(path: string, dbLocale: string): string {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}locale=${encodeURIComponent(dbLocale)}`;
}

function buildBodyClass(
  route: ResolvedPublicRoute,
  post?: ThemePostView,
  kind?: string,
  taxonomy?: { type: string; slug: string },
): string {
  const routeKind = kind ?? route.kind;
  const parts = [`route-${routeKind}`, `locale-${route.locale.replace(/-/g, "_")}`];
  if (taxonomy?.type) parts.push(`taxonomy-${taxonomy.type}`);
  if (taxonomy?.slug) parts.push(`term-${taxonomy.slug.replace(/\//g, "-")}`);
  if (post?.post_type_slug) parts.push(`type-${post.post_type_slug}`);
  if (post?.slug) parts.push(`slug-${post.slug.replace(/\//g, "-")}`);
  return parts.join(" ");
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
  if (post?.post_type_slug === "post") return "single";
  return "page";
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

function applyArchiveContext(
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
): void {
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
  base.locale_switcher = buildLocaleSwitcher(route.locale, route, "archive", archive.postType);
}

type ApiTaxonomyTerm = {
  id?: number;
  name?: string;
  slug?: string;
  type?: string;
};

async function fetchTaxonomyTerm(
  client: AuthenticatedClient,
  taxonomyType: string,
  termSlug: string,
  dbLocale: string,
): Promise<ApiTaxonomyTerm | null> {
  try {
    const list = await fetchJson<ApiListResponse<ApiTaxonomyTerm>>(
      client,
      withLocaleQuery(
        `/api/content/taxonomies?filter_type=${encodeURIComponent(taxonomyType)}&filter_slug=${encodeURIComponent(termSlug)}&limit=1`,
        dbLocale,
      ),
    );
    const term = list.items?.[0];
    if (!term || String(term.slug ?? "") !== termSlug) return null;
    return term;
  } catch {
    return null;
  }
}

async function fetchTaxonomyArchivePosts(
  client: AuthenticatedClient,
  taxonomyType: string,
  termSlug: string,
  page: number,
  dbLocale: string,
  attachmentCache: CoverImageAttachmentCache,
): Promise<{ posts: ThemePostView[]; total: number; limit: number }> {
  const list = await fetchJson<ApiListResponse<ApiPostRow>>(
    client,
    withLocaleQuery(
      `/api/content/posts?page=${page}&limit=10&order=published_at&orderDir=desc&filter_status=published&filter_taxonomy_type=${encodeURIComponent(taxonomyType)}&filter_taxonomy_slug=${encodeURIComponent(termSlug)}`,
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

function applyTaxonomyContext(
  base: ThemeRenderContext,
  route: ResolvedPublicRoute,
  term: ApiTaxonomyTerm,
  posts: ThemePostView[],
  page: number,
  total: number,
  limit: number,
  origin: string,
  siteName: string,
  siteDescription: string,
): void {
  const termName = String(term.name ?? route.taxonomySlug ?? "");
  base.posts = posts.length > 0 ? posts : base.posts;
  base.have_posts = base.posts.length > 0;
  base.route.kind = "taxonomy";
  base.route.taxonomy_type = route.taxonomyType;
  base.route.taxonomy_slug = route.taxonomySlug;
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
    route.taxonomyType && route.taxonomySlug
      ? { type: route.taxonomyType, slug: route.taxonomySlug }
      : undefined;
  base.body_class = buildBodyClass(route, undefined, "taxonomy", taxonomyMeta);
  base.locale_switcher = buildLocaleSwitcher(route.locale, route, "taxonomy");
}

function applyNotFoundContext(base: ThemeRenderContext, route: ResolvedPublicRoute, origin: string): void {
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
  base.locale_switcher = buildLocaleSwitcher(route.locale, route, "404");
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

function applySearchContext(
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
): void {
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
  base.locale_switcher = buildLocaleSwitcher(route.locale, route, "search");
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

    const byLocation: Record<string, Array<{ label: string; url: string; order: number }>> = {};

    for (const row of children) {
      const parentId = row.parent_id;
      if (parentId == null) continue;
      const location = slugByParentId.get(parentId);
      if (!location) continue;

      const meta = parsePostMetaValues(row.meta_values);
      const item = menuChildPostToLinkItem(row, dbLocale);
      if (!item) continue;

      if (!byLocation[location]) byLocation[location] = [];
      byLocation[location].push({
        ...item,
        order: menuOrderFromMeta(meta),
      });
    }

    const menusByLocation: Record<string, { label: string; url: string }[]> = {};
    for (const [location, items] of Object.entries(byLocation)) {
      menusByLocation[location] = items
        .sort((a, b) => a.order - b.order)
        .map(({ label, url }) => ({ label, url }));
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
): void {
  ctx.get_taxonomies = createGetTaxonomiesHandler(async (postType, taxonomyType) =>
    fetchTaxonomiesForPostType(client, postType, taxonomyType, dbLocale),
  );
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
      withLocaleQuery(`/api/content/${encodeURIComponent(String(idOrSlug))}`, dbLocale),
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
          `/api/content/posts?limit=${limit}&order=published_at&orderDir=desc&filter_status=published&filter_taxonomy_type=category&filter_taxonomy_slug=${encodeURIComponent(slug)}`,
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
  route: ResolvedPublicRoute,
  pkg: ThemePackageRecord,
): Promise<ThemeRenderContext> {
  const base = buildMockContext(url, route, pkg);
  const attachmentCache: CoverImageAttachmentCache = new Map();
  const dbLocale = publicLocaleToDbCode(route.locale);
  attachGetTaxonomiesHandler(base, client, dbLocale);
  attachGetRelatedPostsHandler(base, client, dbLocale, attachmentCache);
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
      applySearchContext(
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
      const term = await fetchTaxonomyTerm(client, route.taxonomyType, route.taxonomySlug, dbLocale);
      if (!term) {
        applyNotFoundContext(base, route, client.origin);
        return base;
      }
      const { posts, total, limit } = await fetchTaxonomyArchivePosts(
        client,
        route.taxonomyType,
        route.taxonomySlug,
        page,
        dbLocale,
        attachmentCache,
      );
      applyTaxonomyContext(
        base,
        route,
        term,
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

    const archiveRoute = resolveArchivePostTypeFromRoute(route, archivableTypes);

    if (archiveRoute) {
      const page = route.page ?? 1;
      const { posts, total, limit } = await fetchArchivePosts(
        client,
        archiveRoute.postType,
        page,
        dbLocale,
        attachmentCache,
      );
      applyArchiveContext(
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
        withLocaleQuery(`/api/content/${encodeURIComponent(route.slug)}`, dbLocale),
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
      base.locale_switcher = buildLocaleSwitcher(route.locale, route, kind);
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
      base.locale_switcher = buildLocaleSwitcher(route.locale, route, "home");
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
