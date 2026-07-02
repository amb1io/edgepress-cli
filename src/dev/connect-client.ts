import type { AuthenticatedClient } from "../auth/handshake.ts";
import { fetchJson } from "../auth/handshake.ts";
import {
  resolveCoverImage,
  type CoverImageAttachmentCache,
} from "../engine/cover-image.ts";
import { buildSeoFromPost } from "../engine/seo-head.ts";
import type {
  ResolvedPublicRoute,
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
import { filterPublicThemeListPosts } from "../engine/post-filters.ts";
import {
  filterArchivablePostTypes,
  resolveArchivePostTypeFromRoute,
} from "../engine/post-type-routes.ts";
import { buildMockContext } from "./mock-context.ts";
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
  author_name?: string;
  published_at?: number | string | null;
  post_type_slug?: string;
  post_types_slug?: string;
  status?: string;
  meta_values?: Record<string, unknown>;
  media?: Array<{ id?: number; meta_values?: Record<string, unknown> }>;
  seo?: { title?: string; description?: string; canonical?: string } | null;
  json_ld?: Record<string, unknown>[] | null;
  taxonomies?: Array<{ id?: number; slug?: string; type?: string; name?: string }>;
};

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
  siteDescription: string,
): void {
  base.posts = posts.length > 0 ? posts : base.posts;
  base.have_posts = base.posts.length > 0;
  base.route.kind = "archive";
  base.is_archive = true;
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
    ...(page > 1 ? { prev_url: `${route.path}?page=${page - 1}` } : {}),
    ...(page < totalPages ? { next_url: `${route.path}?page=${page + 1}` } : {}),
  };
  base.seo.title = archive.title;
  base.seo.description = siteDescription;
  base.seo.canonical = `${origin}${route.path}`;
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

  try {
    const [site, settings] = await Promise.all([
      fetchJson<SiteResponse>(client, "/api/content/site"),
      fetchJson<Record<string, string>>(client, "/api/settings?names=site_name,site_description"),
    ]);

    const siteName = String(settings.site_name ?? site.site_name ?? base.site.title).trim() || base.site.title;
    const siteDescription = String(settings.site_description ?? site.site_description ?? "").trim();

    base.site.title = siteName;
    base.site.description = siteDescription;
    base.seo.site_name = siteName;

    const archivableTypes = await fetchArchivablePostTypes(client);
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
      base.is_404 = false;
      base.have_posts = true;

      base.seo = buildSeoFromPost({
        post: {
          title: post.title,
          excerpt: post.excerpt,
          body: post.body_html,
          post_type_slug: post.post_type_slug,
          seo: detail.seo ?? null,
          json_ld: detail.json_ld ?? null,
        },
        fallbackTitle: siteName,
        canonicalUrl: `${client.origin}${route.path}`,
        siteName,
        ogImage: post.cover_image,
      });
      return base;
    }

    if (route.kind === "home") {
      const list = await fetchJson<ApiListResponse<ApiPostRow>>(
        client,
        withLocaleQuery(
          "/api/content/posts?limit=10&order=published_at&orderDir=desc&filter_post_type=post&filter_status=published",
          dbLocale,
        ),
      );
      const posts = await mapPublicListPosts(list.items ?? [], client.origin, client, attachmentCache, dbLocale);
      if (posts.length > 0) {
        base.posts = posts;
        base.post = posts[0];
        base.have_posts = true;
      }
      base.seo.title = siteName;
      base.seo.description = siteDescription;
      base.seo.canonical = `${client.origin}${publicLocaleHomeUrl(route.locale)}`;
      if (posts[0]?.cover_image) {
        base.seo.og_image = posts[0].cover_image;
      }
      if (site.json_ld) {
        const jsonLd = Array.isArray(site.json_ld) ? site.json_ld : [site.json_ld];
        base.seo.json_ld_html = `<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd)}</script>`;
      }
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
