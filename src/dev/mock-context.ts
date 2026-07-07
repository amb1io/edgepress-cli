import type {
  ResolvedPublicRoute,
  ThemePackageRecord,
  ThemePostView,
  ThemeRenderContext,
  ThemeTaxonomiesLocaleResult,
  MenuItem,
} from "../engine/types.ts";
import {
  localeToHtmlLang,
  publicLocaleHomeUrl,
  publicLocaleUrlPrefix,
} from "../engine/resolve-route.ts";
import type { RouteKindResolverDeps } from "../engine/resolve-route-kind.ts";
import { resolveThemeRoute } from "../engine/resolve-theme-route.ts";
import { resolveCoverImageSync } from "../engine/cover-image.ts";
import { isPublicThemeListPost } from "../engine/post-filters.ts";
import { resolveThemeSeoContext } from "../engine/seo-head.ts";
import { buildBodyClass } from "../engine/body-class.ts";
import {
  type ArchivablePostType,
} from "../engine/post-type-routes.ts";
import { buildLocaleSwitcher } from "../engine/locale-switcher.ts";
import {
  createMockTaxonomyTranslationResolver,
  type TaxonomyTranslationResolver,
} from "../engine/taxonomy-translation-client.ts";
import type { ThemeTaxonomyView } from "../engine/types.ts";
import {
  createGetRelatedPostsHandler,
  createGetTaxonomyPostsHandler,
  createGetPostsHandler,
  createGetAuthorHandler,
  createGetTaxonomiesLocaleHandler,
} from "../engine/theme-functions.ts";
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
    { name: "Exemplo", slug: "sample-term" },
  ],
  tag: [{ name: "javascript", slug: "javascript" }],
};

function mockGetTaxonomiesFactory(resolver: TaxonomyTranslationResolver) {
  return async (_postType: string, taxonomyType: string) => {
    const items = MOCK_TAXONOMIES[taxonomyType] ?? [];
    return resolver.localizeTerms(
      items.map((item) => ({
        name: item.name,
        slug: item.slug,
        type: taxonomyType,
      })),
    );
  };
}

function buildMockGetTaxonomyPosts(resolver: TaxonomyTranslationResolver) {
  return createGetTaxonomyPostsHandler(async (taxonomyType, taxonomySlug) => {
    const canonical = await resolver.resolveCanonicalSlugForFilter(taxonomyType, taxonomySlug);
    if (!canonical) return [];
    return [];
  });
}

function buildMockGetTaxonomiesLocale() {
  return createGetTaxonomiesLocaleHandler(
    async (_postType: string, taxonomyType: string, locale: string): Promise<ThemeTaxonomiesLocaleResult> => {
      const items = MOCK_TAXONOMIES[taxonomyType] ?? [];
      const resolver = createMockTaxonomyTranslationResolver(locale);
      const [taxonomy, values] = await Promise.all([
        resolver.localizeTaxonomyType(taxonomyType),
        Promise.all(
          items.map(async (item) => {
            const localized = await resolver.localizeTerm({
              name: item.name,
              slug: item.slug,
              type: taxonomyType,
            });
            return {
              id: 0,
              name: localized.name,
              slug: localized.slug,
              locale,
            };
          }),
        ),
      ]);
      return { taxonomy, values };
    },
  );
}

function buildMockGetPosts() {
  return createGetPostsHandler(async () => []);
}

function buildMockGetPostsDetails() {
  return createGetPostsHandler(async () => []);
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

const MOCK_PAGE_SLUGS = new Set(["portfolio", "about", "hello-world"]);

export function createMockRouteKindDeps(
  locale: string,
  taxonomyResolver: TaxonomyTranslationResolver,
): RouteKindResolverDeps {
  return {
    archivablePostTypes: DEV_ARCHIVABLE_TYPES,
    taxonomyTypes: Object.keys(MOCK_TAXONOMIES),
    resolvePostBySlug: async (slug) => {
      if (!MOCK_PAGE_SLUGS.has(slug) && !slug.includes("post")) {
        return null;
      }
      return { post_type_slug: slug.includes("post") ? "post" : "page" };
    },
    resolveTaxonomyTerm: async (taxonomyType, termSlug) => {
      const term = await taxonomyResolver.resolveTermBySlug(taxonomyType, termSlug);
      if (!term) return null;
      const localized = await taxonomyResolver.localizeTerm(term);
      return { slug: localized.slug };
    },
  };
}

function routeContextFields(route: ResolvedPublicRoute) {
  return {
    kind: route.kind,
    path: route.path,
    locale: route.locale,
    template_key: route.templateKey,
    params: route.params,
    ...(route.taxonomyType
      ? { taxonomy_type: route.taxonomyType, taxonomy_slug: route.taxonomySlug }
      : {}),
  };
}

function isMenuPathActive(url: string, currentPath: string): boolean {
  const normPath = currentPath.replace(/\/+$/, "") || "/";
  const urlNorm = url.replace(/\/+$/, "") || "/";
  return url !== "" && normPath === urlNorm;
}

function buildMockPrimaryMenus(currentPath: string): MenuItem[] {
  return [
    {
      id: 1,
      label: "Home",
      url: "/",
      slug: "home-1",
      active: isMenuPathActive("/", currentPath),
      children: [],
    },
    {
      id: 2,
      label: "Blog",
      url: "/posts",
      slug: "blog-1",
      active: currentPath.startsWith("/posts"),
      submenu_sort: "alphabetical",
      submenu_display: ["title"],
      children: [
        {
          id: 3,
          label: "Tecnologia",
          url: "/category/tecnologia",
          slug: "tecnologia-1",
          active: isMenuPathActive("/category/tecnologia", currentPath),
          children: [],
        },
      ],
    },
    {
      id: 4,
      label: "Eventos",
      url: "/eventos",
      slug: "eventos-1",
      active: currentPath.startsWith("/eventos"),
      children: [],
    },
  ];
}

function resolveDevArchive(route: ResolvedPublicRoute): { kind: string; postType: string; title: string } | null {
  if (route.kind !== "archive" || !route.postType) return null;
  const match = DEV_ARCHIVABLE_TYPES.find((type) => type.slug === route.postType);
  return {
    kind: "archive",
    postType: route.postType,
    title: match?.name ?? (route.postType === "post" ? "Blog" : route.postType),
  };
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

export async function buildMockContext(
  url: URL,
  pathname: string,
  searchParams: URLSearchParams,
  pkg: ThemePackageRecord,
  resolvedRoute?: ResolvedPublicRoute,
): Promise<ThemeRenderContext> {
  const baseUrl = url.origin;
  const templateKeys = Object.keys(pkg.templates);
  const localeGuess = pathname.startsWith("/en") ? "en" : "pt-br";
  const taxonomyResolver = createMockTaxonomyTranslationResolver(localeGuess);
  const route =
    resolvedRoute ??
    (await resolveThemeRoute(
      pathname,
      searchParams,
      templateKeys,
      createMockRouteKindDeps(localeGuess, taxonomyResolver),
    ));
  const locale = route.locale;
  const localePrefix = publicLocaleUrlPrefix(locale);
  const homeUrl = publicLocaleHomeUrl(locale);
  const siteName = "Edgepress Theme Dev";
  const siteDescription = "Preview local do tema Liquid";
  const homeListPosts = pkg.manifest.home_list_posts === true;
  const mockGetTaxonomies = mockGetTaxonomiesFactory(taxonomyResolver);
  const mockGetTaxonomyPosts = buildMockGetTaxonomyPosts(taxonomyResolver);

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
        primary: buildMockPrimaryMenus(route.path),
      },
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
        supports: pkg.manifest.supports ?? [],
      },
      route: routeContextFields(route),
      body_class: buildBodyClass(route, undefined, "search"),
      locale_switcher: await buildLocaleSwitcher(route.locale, route, "search"),
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
      get_taxonomies_locale: buildMockGetTaxonomiesLocale(),
      get_related_posts: buildMockGetRelatedPosts(route),
      get_taxonomy_posts: mockGetTaxonomyPosts,
      get_posts: buildMockGetPosts(),
      get_posts_details: buildMockGetPostsDetails(),
      get_author: buildMockGetAuthor(),
    };
  }

  if (route.kind === "taxonomy" && route.taxonomyType && route.taxonomySlug) {
    const term = await taxonomyResolver.resolveTermBySlug(
      route.taxonomyType,
      route.taxonomySlug,
    );
    const localized = term ? await taxonomyResolver.localizeTerm(term) : null;
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
    const archiveTitle = localized?.name ?? route.taxonomySlug;
    const taxonomyMeta = localized
      ? { type: route.taxonomyType, slug: localized.slug }
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
        primary: buildMockPrimaryMenus(route.path),
      },
      theme: {
        slug: pkg.manifest.slug,
        version: pkg.manifest.version,
        asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
        supports: pkg.manifest.supports ?? [],
      },
      route: routeContextFields({ ...route, kind: kind as ThemeRenderContext["route"]["kind"] }),
      body_class: buildBodyClass(route, undefined, kind, taxonomyMeta),
      locale_switcher: await buildLocaleSwitcher(route.locale, route, kind as ThemeRenderContext["route"]["kind"], {
        taxonomyCanonicalSlug: term?.slug,
        resolveLocalizedTaxonomySlug: (slug, targetLocale) =>
          taxonomyResolver.getLocalizedSlug(slug, targetLocale),
      }),
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
      get_taxonomies_locale: buildMockGetTaxonomiesLocale(),
      get_related_posts: buildMockGetRelatedPosts(route),
      get_taxonomy_posts: mockGetTaxonomyPosts,
      get_posts: buildMockGetPosts(),
      get_posts_details: buildMockGetPostsDetails(),
      get_author: buildMockGetAuthor(),
    };
  }

  let kind = route.kind;
  const devArchive = resolveDevArchive(route);
  const archivePostType = devArchive?.postType ?? route.postType ?? "post";

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
      primary: buildMockPrimaryMenus(route.path),
    },
    theme: {
      slug: pkg.manifest.slug,
      version: pkg.manifest.version,
      asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
      supports: pkg.manifest.supports ?? [],
    },
    route: routeContextFields({ ...route, kind: kind as ThemeRenderContext["route"]["kind"] }),
    body_class: buildBodyClass(route, post, kind),
    locale_switcher: await buildLocaleSwitcher(
      route.locale,
      route,
      kind as ThemeRenderContext["route"]["kind"],
      { archivePostType },
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
    get_taxonomies_locale: buildMockGetTaxonomiesLocale(),
    get_related_posts: buildMockGetRelatedPosts(route, post),
    get_taxonomy_posts: mockGetTaxonomyPosts,
    get_posts: buildMockGetPosts(),
    get_posts_details: buildMockGetPostsDetails(),
    get_author: buildMockGetAuthor(post),
  };
}
