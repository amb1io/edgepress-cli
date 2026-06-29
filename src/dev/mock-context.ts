import type {
  LocaleSwitcherItem,
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
import { NON_ARCHIVABLE_POST_TYPE_SLUGS } from "../engine/post-type-routes.ts";

const DEV_ARCHIVABLE_SLUGS = new Set(["post", "eventos"]);

function buildDevLocaleUrl(
  targetLocale: string,
  route: ResolvedPublicRoute,
  kind: string,
  archivePostType?: string,
): string {
  const prefix = publicLocaleUrlPrefix(targetLocale);
  if (kind === "archive") {
    if (archivePostType === "post") return `${prefix}/posts`;
    return `${prefix}/${archivePostType ?? "posts"}`;
  }
  if (route.slug) {
    return `${prefix}/${route.slug}`;
  }
  return publicLocaleHomeUrl(targetLocale);
}

function buildDevLocaleSwitcher(
  route: ResolvedPublicRoute,
  kind: string,
  archivePostType?: string,
): LocaleSwitcherItem[] {
  return [
    {
      code: "pt-br",
      flag: "🇧🇷",
      label: "PT",
      url: buildDevLocaleUrl("pt-br", route, kind, archivePostType),
      active: route.locale === "pt-br",
    },
    {
      code: "en",
      flag: "🇺🇸",
      label: "EN",
      url: buildDevLocaleUrl("en", route, kind, archivePostType),
      active: route.locale === "en",
    },
  ];
}

function resolveDevArchive(route: ResolvedPublicRoute): { kind: string; postType: string; title: string } | null {
  if (route.kind === "archive") {
    const postType = route.postType ?? "post";
    return { kind: "archive", postType, title: postType === "post" ? "Blog" : postType };
  }
  if (route.slug && DEV_ARCHIVABLE_SLUGS.has(route.slug) && !NON_ARCHIVABLE_POST_TYPE_SLUGS.has(route.slug)) {
    const postType = route.slug;
    return {
      kind: "archive",
      postType,
      title: postType === "post" ? "Blog" : postType.charAt(0).toUpperCase() + postType.slice(1),
    };
  }
  return null;
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

  let kind = route.kind;
  const devArchive = resolveDevArchive(route);
  const archivePostType = devArchive?.postType;
  if (devArchive) {
    kind = "archive";
  } else if (route.slug && kind === "page") {
    kind = route.slug.includes("post") ? "single" : "page";
  }

  const samplePost: ThemePostView = {
    id: 1,
    title: kind === "home" ? "Bem-vindo ao Edgepress" : `Preview: ${route.slug ?? "home"}`,
    slug: route.slug ?? "hello-world",
    excerpt: "Texto de exemplo para preview local do tema.",
    body_html:
      "<p>Este é o preview do tema via <code>edgepress theme dev</code>. Use <code>--connect</code> para dados reais do CMS.</p>",
    author_name: "Edgepress",
    published_at: Date.now(),
    post_type_slug: kind === "single" ? "post" : "page",
    meta: {},
  };

  const post = kind === "archive" ? undefined : samplePost;
  const posts =
    kind === "archive"
      ? [
          samplePost,
          { ...samplePost, id: 2, title: "Segundo item do arquivo", slug: "item-2" },
        ]
      : [samplePost];

  const is_front_page = kind === "home";
  const is_single = kind === "single";
  const is_page = kind === "page";
  const is_singular = is_single || is_page;
  const is_archive = kind === "archive";
  const is_404 = kind === "404";
  const have_posts = posts.length > 0;
  const archiveTitle = devArchive?.title ?? "Blog";
  const archiveType = archivePostType ?? "post";

  return {
    site: {
      title: "Edgepress Theme Dev",
      description: "Preview local do tema Liquid",
      locale,
      locale_prefix: localePrefix,
      home_url: homeUrl,
      base_url: baseUrl,
      html_lang: localeToHtmlLang(locale),
      year: new Date().getFullYear(),
    },
    seo: {
      title: kind === "archive" ? archiveTitle : samplePost.title,
      description: samplePost.excerpt,
      canonical: `${baseUrl}${route.path || "/"}`,
      og_type: kind === "single" ? "article" : "website",
      site_name: "Edgepress Theme Dev",
    },
    menus: {
      primary: [
        { label: "Home", url: "/", active: route.path === "/" },
        { label: "Blog", url: "/posts", active: route.path.startsWith("/posts") },
        { label: "Eventos", url: "/eventos", active: route.path.startsWith("/eventos") },
      ],
    },
    theme: {
      slug: pkg.manifest.slug,
      version: pkg.manifest.version,
      asset_base_url: `${baseUrl}/themes-assets/${pkg.manifest.slug}`,
    },
    route: { kind: kind as ThemeRenderContext["route"]["kind"], path: route.path, locale },
    body_class: `route-${kind} locale-${locale.replace(/-/g, "_")}`,
    locale_switcher: buildDevLocaleSwitcher(route, kind, archivePostType),
    ...(post ? { post } : {}),
    posts,
    archive: { title: archiveTitle, type: archiveType },
    pagination: { page: 1, total_pages: 1 },
    is_front_page,
    is_single,
    is_page,
    is_singular,
    is_archive,
    is_404,
    have_posts,
  };
}
