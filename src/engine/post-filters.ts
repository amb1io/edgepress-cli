export type PublicThemeListPostInput = {
  status?: string;
  post_type_slug?: string;
  post_types_slug?: string;
  meta_values?: Record<string, unknown>;
};

function isTruthyShowInMenu(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }
  return false;
}

/** Posts visíveis em listagens de tema: publicados, sem CPT menus e sem post pai do menu lateral. */
export function isPublicThemeListPost(post: PublicThemeListPostInput): boolean {
  if (String(post.status ?? "").toLowerCase() !== "published") {
    return false;
  }

  const postType = String(post.post_type_slug ?? post.post_types_slug ?? "")
    .trim()
    .toLowerCase();
  if (postType === "menus") {
    return false;
  }

  const meta = post.meta_values ?? {};
  if (isTruthyShowInMenu(meta["show_in_menu"])) {
    return false;
  }

  return true;
}

export function filterPublicThemeListPosts<T extends PublicThemeListPostInput>(posts: T[]): T[] {
  return posts.filter(isPublicThemeListPost);
}
