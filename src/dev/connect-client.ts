import type { AuthenticatedClient } from "../auth/handshake.ts";
import { fetchJson } from "../auth/handshake.ts";
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
  publicLocaleUrlPrefix,
} from "../engine/resolve-route.ts";
import { buildMockContext } from "./mock-context.ts";

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
  meta_values?: Record<string, unknown>;
  seo?: { title?: string; description?: string; canonical?: string } | null;
  json_ld?: Record<string, unknown>[] | null;
};

type SiteResponse = {
  site_name?: string;
  site_description?: string;
  site_url?: string;
  json_ld?: Record<string, unknown> | Record<string, unknown>[];
};

function mapPost(row: ApiPostRow, baseUrl: string): ThemePostView {
  const meta: Record<string, string> = {};
  if (row.meta_values && typeof row.meta_values === "object") {
    for (const [k, v] of Object.entries(row.meta_values)) {
      if (v != null) meta[k] = String(v);
    }
  }

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

function inferRouteKind(route: ResolvedPublicRoute, post?: ThemePostView): ThemeRenderContext["route"]["kind"] {
  if (route.kind === "home") return "home";
  if (route.kind === "archive") return "archive";
  if (route.kind === "404") return "404";
  if (post?.post_type_slug === "post") return "single";
  return "page";
}

export async function buildConnectedContext(
  client: AuthenticatedClient,
  url: URL,
  route: ResolvedPublicRoute,
  pkg: ThemePackageRecord,
): Promise<ThemeRenderContext> {
  const base = buildMockContext(url, route, pkg);

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

    if (route.kind === "archive" || route.path.includes("/posts")) {
      const page = route.page ?? 1;
      const list = await fetchJson<ApiListResponse<ApiPostRow>>(
        client,
        `/api/content/posts?page=${page}&limit=10&order=published_at&orderDir=desc`,
      );
      const posts = (list.items ?? []).map((row) => mapPost(row, client.origin));
      base.posts = posts.length > 0 ? posts : base.posts;
      base.have_posts = base.posts.length > 0;
      base.route.kind = "archive";
      base.is_archive = true;
      base.is_front_page = false;
      base.is_single = false;
      base.is_page = false;
      base.is_singular = false;
      base.post = undefined;
      base.archive = { title: "Blog", type: "post" };
      const total = list.total ?? posts.length;
      const limit = list.limit ?? 10;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      base.pagination = {
        page,
        total_pages: totalPages,
        ...(page > 1 ? { prev_url: `${route.path}?page=${page - 1}` } : {}),
        ...(page < totalPages ? { next_url: `${route.path}?page=${page + 1}` } : {}),
      };
      base.seo.title = "Blog";
      base.seo.description = siteDescription;
      base.seo.canonical = `${client.origin}${route.path}`;
      return base;
    }

    if (route.slug && route.kind !== "home") {
      const detail = await fetchJson<ApiPostRow>(client, `/api/content/${encodeURIComponent(route.slug)}`);
      const post = mapPost(detail, client.origin);
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
      });
      return base;
    }

    if (route.kind === "home") {
      const list = await fetchJson<ApiListResponse<ApiPostRow>>(
        client,
        "/api/content/posts?limit=10&order=published_at&orderDir=desc",
      );
      const posts = (list.items ?? []).map((row) => mapPost(row, client.origin));
      if (posts.length > 0) {
        base.posts = posts;
        base.post = posts[0];
        base.have_posts = true;
      }
      base.seo.title = siteName;
      base.seo.description = siteDescription;
      base.seo.canonical = `${client.origin}${publicLocaleHomeUrl(route.locale)}`;
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
