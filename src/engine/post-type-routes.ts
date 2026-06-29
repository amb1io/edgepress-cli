import type { ResolvedPublicRoute } from "./types.ts";

export const POST_TYPE_ARCHIVE_ALIASES: Record<string, string> = {
  posts: "post",
  blog: "post",
};

export const NON_ARCHIVABLE_POST_TYPE_SLUGS = new Set([
  "page",
  "attachment",
  "themes",
  "user",
  "settings",
  "dashboard",
  "post_type",
  "custom_fields",
  "translations_languages",
  "menus",
]);

export type ArchivablePostType = {
  slug: string;
  name: string;
};

export function isArchivablePostTypeSlug(
  slug: string,
  types: ArchivablePostType[],
): boolean {
  const normalized = slug.trim().toLowerCase();
  return types.some((type) => type.slug === normalized);
}

export function resolveArchivePostTypeFromRoute(
  route: ResolvedPublicRoute,
  types: ArchivablePostType[],
): { postType: string; title: string } | null {
  if (route.kind === "archive") {
    const postType = route.postType ?? "post";
    const match = types.find((type) => type.slug === postType);
    return {
      postType,
      title: match?.name ?? (postType === "post" ? "Blog" : postType),
    };
  }

  if (route.slug && isArchivablePostTypeSlug(route.slug, types)) {
    const match = types.find((type) => type.slug === route.slug)!;
    return { postType: match.slug, title: match.name };
  }

  return null;
}

export function buildArchivePublicPath(postType: string, localePrefix: string): string {
  if (postType === "post") {
    return `${localePrefix}/posts`;
  }
  return `${localePrefix}/${postType}`;
}
