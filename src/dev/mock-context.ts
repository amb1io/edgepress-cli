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
import {
  type ArchivablePostType,
  resolveArchivePostTypeFromRoute,
} from "../engine/post-type-routes.ts";
import { buildLocaleSwitcher } from "../engine/locale-switcher.ts";

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
    author_name: "Edgepress",
    published_at: Date.now(),
    post_type_slug: kind === "single" ? "post" : "page",
    meta: Object.fromEntries(Object.entries(sampleMeta).map(([k, v]) => [k, String(v)])),
    ...(sampleCover ? { cover_image: sampleCover } : {}),
  };

  const post = kind === "archive" ? undefined : samplePost;
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
      ...(samplePost.cover_image ? { og_image: samplePost.cover_image } : {}),
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
    is_404,
    have_posts,
  };
}
