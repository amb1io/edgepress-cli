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
import { resolveCoverImageSync } from "../engine/cover-image.ts";
import { isPublicThemeListPost } from "../engine/post-filters.ts";
import { resolveThemeSeoContext } from "../engine/seo-head.ts";
import {
  type ArchivablePostType,
  resolveArchivePostTypeFromRoute,
} from "../engine/post-type-routes.ts";
import { buildLocaleSwitcher } from "../engine/locale-switcher.ts";
import type { ThemeTaxonomyView } from "../engine/types.ts";
import { createGetRelatedPostsHandler, createGetAuthorHandler } from "../engine/theme-functions.ts";
import {
  buildRelatedPostsCacheKey,
  devRelatedPostsCache,
  isNumericPostIdentifier,
} from "../engine/related-posts-cache.ts";
import { buildAuthorCacheKey, devAuthorCache } from "../engine/author-cache.ts";

const MOCK_TAXONOMIES: Record<string, ThemeTaxonomyView[]> = {
  category: [
    { name: "Tecnologia", slug: "tecnologia" },
    { name: "Design", slug: "design" },
    { name: "Visum", slug: "visum" },
  ],
  tag: [{ name: "javascript", slug: "javascript" }],
};

const MOCK_TERMS: Record<string, Record<string, { name: string }>> = {
  category: {
    tecnologia: { name: "Tecnologia" },
    design: { name: "Design" },
    visum: { name: "Visum" },
  },
  tag: {
    javascript: { name: "javascript" },
  },
};

function resolveMockTerm(
  taxonomyType: string,
  termSlug: string,
): { name: string } | null {
  return MOCK_TERMS[taxonomyType]?.[termSlug] ?? null;
}

function mockGetTaxonomies(_postType: string, taxonomyType: string): Promise<ThemeTaxonomyView[]> {
  return Promise.resolve(MOCK_TAXONOMIES[taxonomyType] ?? []);
}

function resolveMockSourcePostId(idOrSlug: string | number, fallbackId = 1): number {
  if (isNumericPostIdentifier(idOrSlug)) return Number(idOrSlug);
  return fallbackId;
}

function buildMockGetRelatedPosts(route: ResolvedPublicRoute, fallbackPost?: ThemePostView) {
  return createGetRelatedPostsHandler(async (idOrSlug, limit) => {
    const sourceId = resolveMockSourcePostId(idOrSlug, fallbackPost?.id ?? 1);
    const localeCode = route.locale === "en" ? "en_US" : "pt_BR";
    const cacheKey = buildRelatedPostsCacheKey({
      postId: sourceId,
      localeCode,
      limit,
    });

    let ids = devRelatedPostsCache.get(cacheKey);
    if (!ids) {
      ids = [101, 102, 103].filter((id) => id !== sourceId).slice(0, limit);
      devRelatedPostsCache.set(cacheKey, ids);
    }

    const baseUrl = "http://localhost";
    const sampleMeta = { post_thumbnail_path: "https://placehold.co/800x400?text=Related" };
    const cover = resolveCoverImageSync({ meta_values: sampleMeta, media: [] }, baseUrl);

    return ids.map((id) => ({
      id,
      title: `Relacionado ${id}`,
      slug: `related-${id}`,
      excerpt: "Preview de post relacionado.",
      body_html: "<p>Post relacionado mock.</p>",
      author_name: "Edgepress",
      published_at: Date.now(),
      post_type_slug: "post",
      meta: Object.fromEntries(Object.entries(sampleMeta).map(([k, v]) => [k, String(v)])),
      ...(cover ? { cover_image: cover } : {}),
    }));
  });
}

function buildMockGetAuthor(fallbackPost?: ThemePostView) {
  return createGetAuthorHandler(async (idOrSlug) => {
    const sourceId = resolveMockSourcePostId(idOrSlug, fallbackPost?.id ?? 1);
    const authorUserId = `mock-user-${sourceId}`;
    const cacheKey = buildAuthorCacheKey(authorUserId);

    const cached = devAuthorCache.get(cacheKey);
    if (cached) return cached;

    const author = {
      name: fallbackPost?.author_name || "Edgepress",
      image: "https://placehold.co/64x64?text=A",
      description: "Biografia de exemplo para preview local.",
    };
    devAuthorCache.set(cacheKey, author);
    return author;
  });
}

const DEV_ARCHIVABLE_TYPES: ArchivablePostType[] = [
  { slug: "post", name: "Post" },
  { slug: "blog", name: "Blog" },
  { slug: "eventos", name: "Eventos" },
];

function resolveDevArchive(route: ResolvedPublicRoute): { kind: string; postType: string; title: string } | null {
  const resolved = resolveArchivePostTypeFromRoute(route, DEV_ARCHIVABLE_TYPES);
  if (!resolved) return null;
  return {
    kind: "archive",
    postType: resolved.postType,
    title: resolved.postType === "post" ? "Blog" : resolved.title,
  };
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

export function buildMockContext(
  url: URL,
  route: ResolvedPublicRoute,
  pkg: ThemePackageRecord,
): ThemeRenderContext {
  const baseUrl = url.origin;
  const locale = route.locale;
  const localePrefix = publicLocaleUrlPrefix(locale);
  const homeUrl = publicLocaleHomeUrl(locale);
  const siteName = "Edgepress Theme Dev";
  const siteDescription = "Preview local do tema Liquid";
  const homeListPosts = pkg.manifest.home_list_posts === true;

  if (route.kind === "search") {
    const q = route.searchQuery?.trim() || url.searchParams.get("q")?.trim() || "tecnologia";
    const page = route.page ?? 1;
    const sampleMeta = {
      post_thumbnail_path: "https://placehold.co/800x400?text=Cover",
    };
    const sampleCover = resolveCoverImageSync({ meta_values: sampleMeta, media: [] }, baseUrl);
    const samplePost: ThemePostView = {
      id: 1,
      title: `Resultado: ${q}`,
      slug: "hello-world",
      excerpt: "Preview de resultado de busca.",
      body_html: "<p>Post encontrado na busca mock.</p>",
      author_name: "Edgepress",
      published_at: Date.now(),
      post_type_slug: "post",
      meta: Object.fromEntries(Object.entries(sampleMeta).map(([k, v]) => [k, String(v)])),
      ...(sampleCover ? { cover_image: sampleCover } : {}),
    };
    const posts = q
      ? [
          samplePost,
          { ...samplePost, id: 2, title: `Outro resultado: ${q}`, slug: "item-2" },
        ]
      : [];
    const archiveTitle = q ? `Busca: ${q}` : "Busca";
    const total = posts.length;

    return {
      site: {
        title: siteName,
        description: siteDescription,
        locale,
        locale_prefix: localePrefix,
        home_url: homeUrl,
        base_url: baseUrl,
        html_lang: localeToHtmlLang(locale),
        year: new Date().getFullYear(),
      },
      seo: resolveThemeSeoContext({
        resolvedKind: "search",
        isArchiveRoute: true,
        archiveTitle,
        homeListPosts: false,
        siteName,
        siteDescription,
        canonicalUrl: `${baseUrl}${buildSearchPageUrl(route.path, q, page)}`,
        ...(posts[0]?.cover_image ? { ogImage: posts[0].cover_image } : {}),
      }),
      menus: {
        primary: [
          { label: "Home", url: "/", active: false },
          { label: "Blog", url: "/posts", active: false },
        ],
      },
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
        supports: pkg.manifest.supports ?? [],
      },
      route: {
        kind: "search",
        path: route.path,
        locale,
      },
      body_class: buildBodyClass(route, undefined, "search"),
      locale_switcher: buildLocaleSwitcher(route.locale, route, "search"),
      posts,
      archive: { title: archiveTitle, type: "search" },
      search: { query: q, total },
      pagination: {
        page,
        total_pages: 1,
        ...(page > 1 ? { prev_url: buildSearchPageUrl(route.path, q, page - 1) } : {}),
      },
      is_front_page: false,
      is_single: false,
      is_page: false,
      is_singular: false,
      is_archive: false,
      is_search: true,
      is_404: false,
      have_posts: posts.length > 0,
      get_taxonomies: mockGetTaxonomies,
      get_related_posts: buildMockGetRelatedPosts(route),
      get_author: buildMockGetAuthor(),
    };
  }

  if (route.kind === "taxonomy" && route.taxonomyType && route.taxonomySlug) {
    const term = resolveMockTerm(route.taxonomyType, route.taxonomySlug);
    const kind = term ? "taxonomy" : "404";
    const page = route.page ?? 1;
    const sampleMeta = {
      post_thumbnail_path: "https://placehold.co/800x400?text=Cover",
    };
    const sampleCover = resolveCoverImageSync({ meta_values: sampleMeta, media: [] }, baseUrl);
    const samplePost: ThemePostView = {
      id: 1,
      title: `Preview: ${route.taxonomySlug}`,
      slug: "hello-world",
      excerpt: "Texto de exemplo para preview local do tema.",
      body_html:
        "<p>Este é o preview do tema via <code>edgepress theme dev</code>.</p>",
      author_name: "Edgepress",
      published_at: Date.now(),
      post_type_slug: "post",
      meta: Object.fromEntries(Object.entries(sampleMeta).map(([k, v]) => [k, String(v)])),
      ...(sampleCover ? { cover_image: sampleCover } : {}),
    };
    const rawPosts = term
      ? [samplePost, { ...samplePost, id: 2, title: "Segundo item do arquivo", slug: "item-2" }]
      : [];
    const posts = rawPosts.filter((item) =>
      isPublicThemeListPost({
        status: "published",
        post_type_slug: item.post_type_slug,
        meta_values: item.meta,
      }),
    );
    const archiveTitle = term?.name ?? route.taxonomySlug;
    const taxonomyMeta = term
      ? { type: route.taxonomyType, slug: route.taxonomySlug }
      : undefined;

    return {
      site: {
        title: siteName,
        description: siteDescription,
        locale,
        locale_prefix: localePrefix,
        home_url: homeUrl,
        base_url: baseUrl,
        html_lang: localeToHtmlLang(locale),
        year: new Date().getFullYear(),
      },
      seo: resolveThemeSeoContext({
        resolvedKind: kind as ThemeRenderContext["route"]["kind"],
        isArchiveRoute: kind === "taxonomy",
        archiveTitle,
        homeListPosts: false,
        siteName,
        siteDescription,
        canonicalUrl: `${baseUrl}${route.path || "/"}`,
        ...(posts[0]?.cover_image ? { ogImage: posts[0].cover_image } : {}),
      }),
      menus: {
        primary: [
          { label: "Home", url: "/", active: route.path === "/" },
          { label: "Blog", url: "/posts", active: route.path.startsWith("/posts") },
          { label: "Tecnologia", url: "/category/tecnologia", active: route.path === "/category/tecnologia" },
          { label: "Eventos", url: "/eventos", active: route.path.startsWith("/eventos") },
        ],
      },
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
        supports: pkg.manifest.supports ?? [],
      },
      route: {
        kind: kind as ThemeRenderContext["route"]["kind"],
        path: route.path,
        locale,
        ...(taxonomyMeta
          ? { taxonomy_type: taxonomyMeta.type, taxonomy_slug: taxonomyMeta.slug }
          : {}),
      },
      body_class: buildBodyClass(route, undefined, kind, taxonomyMeta),
      locale_switcher: buildLocaleSwitcher(route.locale, route, kind as ThemeRenderContext["route"]["kind"]),
      posts,
      archive: { title: archiveTitle, type: route.taxonomyType },
      pagination: {
        page,
        total_pages: 1,
        ...(page > 1 ? { prev_url: buildArchivePageUrl(route.path, page - 1) } : {}),
      },
      is_front_page: false,
      is_single: false,
      is_page: false,
      is_singular: false,
      is_archive: kind === "taxonomy",
      is_search: false,
      is_404: kind === "404",
      have_posts: posts.length > 0,
      get_taxonomies: mockGetTaxonomies,
      get_related_posts: buildMockGetRelatedPosts(route),
      get_author: buildMockGetAuthor(),
    };
  }

  let kind = route.kind;
  const devArchive = resolveDevArchive(route);
  const archivePostType = devArchive?.postType;
  if (devArchive) {
    kind = "archive";
  } else if (route.slug && kind === "page") {
    kind = route.slug.includes("post") ? "single" : "page";
  }

  const sampleMeta = {
    post_thumbnail_path: "https://placehold.co/800x400?text=Cover",
  };
  const sampleCover = resolveCoverImageSync({ meta_values: sampleMeta, media: [] }, baseUrl);

  const samplePost: ThemePostView = {
    id: 1,
    title: kind === "home" ? "Bem-vindo ao Edgepress" : `Preview: ${route.slug ?? "home"}`,
    slug: route.slug ?? "hello-world",
    excerpt: "Texto de exemplo para preview local do tema.",
    body_html:
      "<p>Este é o preview do tema via <code>edgepress theme dev</code>. Use <code>--connect</code> para dados reais do CMS.</p>",
    ...(kind === "home"
      ? {
          body_blocks: JSON.stringify([
            {
              id: "preview-col-list",
              type: "columnList",
              props: {},
              content: [],
              children: [],
            },
          ]),
        }
      : {}),
    author_name: "Edgepress",
    published_at: Date.now(),
    post_type_slug: kind === "single" ? "post" : "page",
    meta: Object.fromEntries(Object.entries(sampleMeta).map(([k, v]) => [k, String(v)])),
    ...(sampleCover ? { cover_image: sampleCover } : {}),
  };

  const post =
    kind === "archive" || (kind === "home" && homeListPosts) ? undefined : samplePost;
  const rawPosts: ThemePostView[] =
    kind === "archive"
      ? [
          samplePost,
          { ...samplePost, id: 2, title: "Segundo item do arquivo", slug: "item-2" },
        ]
      : [samplePost];
  const posts = rawPosts.filter((item) =>
    isPublicThemeListPost({
      status: "published",
      post_type_slug: item.post_type_slug,
      meta_values: item.meta,
    }),
  );

  const is_front_page = kind === "home";
  const is_single = kind === "single";
  const is_page = kind === "page";
  const is_singular = is_single || is_page;
  const is_archive = kind === "archive";
  const is_search = false;
  const is_404 = kind === "404";
  const have_posts = posts.length > 0;
  const archiveTitle = devArchive?.title ?? "Blog";
  const archiveType = archivePostType ?? "post";
  const isArchiveRoute = kind === "archive";

  const seoPost =
    kind === "home" && !homeListPosts
      ? samplePost
      : kind === "single" || kind === "page"
        ? samplePost
        : undefined;
  const seoOgImage =
    seoPost?.cover_image ?? (kind === "home" && homeListPosts ? posts[0]?.cover_image : undefined);

  return {
    site: {
      title: siteName,
      description: siteDescription,
      locale,
      locale_prefix: localePrefix,
      home_url: homeUrl,
      base_url: baseUrl,
      html_lang: localeToHtmlLang(locale),
      year: new Date().getFullYear(),
    },
    seo: resolveThemeSeoContext({
      resolvedKind: kind as ThemeRenderContext["route"]["kind"],
      isArchiveRoute,
      archiveTitle,
      homeListPosts,
      ...(seoPost
        ? {
            seoPost: {
              title: seoPost.title,
              excerpt: seoPost.excerpt,
              body: seoPost.body_html,
              post_type_slug: seoPost.post_type_slug,
            },
          }
        : {}),
      siteName,
      siteDescription,
      canonicalUrl: `${baseUrl}${route.path || "/"}`,
      ...(seoOgImage ? { ogImage: seoOgImage } : {}),
    }),
    menus: {
      primary: [
        { label: "Home", url: "/", active: route.path === "/" },
        { label: "Blog", url: "/posts", active: route.path.startsWith("/posts") },
        { label: "Tecnologia", url: "/category/tecnologia", active: route.path === "/category/tecnologia" },
        { label: "Eventos", url: "/eventos", active: route.path.startsWith("/eventos") },
      ],
    },
    theme: {
      slug: pkg.manifest.slug,
      version: pkg.manifest.version,
      asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
      supports: pkg.manifest.supports ?? [],
    },
    route: { kind: kind as ThemeRenderContext["route"]["kind"], path: route.path, locale },
    body_class: buildBodyClass(route, post, kind),
    locale_switcher: buildLocaleSwitcher(
      route.locale,
      route,
      kind as ThemeRenderContext["route"]["kind"],
      archivePostType,
    ),
    ...(post ? { post } : {}),
    posts,
    archive: { title: archiveTitle, type: archiveType },
    pagination: { page: 1, total_pages: 1 },
    is_front_page,
    is_single,
    is_page,
    is_singular,
    is_archive,
    is_search,
    is_404,
    have_posts,
    get_taxonomies: mockGetTaxonomies,
    get_related_posts: buildMockGetRelatedPosts(route, post),
    get_author: buildMockGetAuthor(post),
  };
}
