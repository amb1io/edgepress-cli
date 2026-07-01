export type ThemeRouteKind = "home" | "single" | "page" | "archive" | "taxonomy" | "404";

export type ThemeManifest = {
  name: string;
  slug: string;
  version: string;
  engine: "liquid";
  supports: string[];
  templates: Record<string, string>;
  layout?: string;
  assets_dir?: string;
  home_content_key?: string;
  /** When true, home is a post listing (`posts`); when false/absent, home uses `home_content_key` as singular content */
  home_list_posts?: boolean;
};

export type ThemePackageRecord = {
  manifest: ThemeManifest;
  templates: Record<string, string>;
  updated_at: number;
};

export type MenuItem = {
  label: string;
  url: string;
  active: boolean;
};

export type ThemeTaxonomyView = {
  name: string;
  slug: string;
};

export type ThemeAuthorView = {
  name: string;
  image: string;
  description: string;
};

export type ThemePostView = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  body_html: string;
  author_name: string;
  published_at: number | null;
  post_type_slug: string;
  cover_image?: string;
  meta: Record<string, string>;
};

export type ThemePagination = {
  page: number;
  total_pages: number;
  prev_url?: string;
  next_url?: string;
};

export type ThemeSeoContext = {
  title: string;
  description: string;
  canonical: string;
  og_image?: string;
  og_type: string;
  site_name?: string;
  json_ld_html?: string;
};

export type ThemeSiteContext = {
  title: string;
  description: string;
  locale: string;
  locale_prefix: string;
  home_url: string;
  base_url: string;
  html_lang: string;
  year: number;
};

export type LocaleSwitcherItem = {
  code: string;
  label: string;
  flag: string;
  url: string;
  active: boolean;
};

export type ThemeRenderContext = {
  site: ThemeSiteContext;
  seo: ThemeSeoContext;
  menus: Record<string, MenuItem[]>;
  theme: {
    slug: string;
    version: string;
    asset_base_url: string;
  };
  route: {
    kind: ThemeRouteKind;
    path: string;
    locale: string;
    /** DB taxonomy type when `kind` is `taxonomy` (e.g. `category`). */
    taxonomy_type?: string;
    /** Term slug when `kind` is `taxonomy` (e.g. `visum`). */
    taxonomy_slug?: string;
  };
  body_class: string;
  locale_switcher: LocaleSwitcherItem[];
  post?: ThemePostView;
  posts: ThemePostView[];
  archive: {
    title: string;
    type: string;
  };
  pagination: ThemePagination;
  is_front_page: boolean;
  is_single: boolean;
  is_page: boolean;
  is_singular: boolean;
  is_archive: boolean;
  is_404: boolean;
  have_posts: boolean;
  /** Fetch taxonomy terms for a post type (used by {% get_taxonomies %} tag). */
  get_taxonomies?: (postType: string, taxonomyType: string) => Promise<ThemeTaxonomyView[]>;
  /** Fetch related posts by shared category (used by {% get_related_posts %} tag). */
  get_related_posts?: (idOrSlug: string | number, limit?: number) => Promise<ThemePostView[]>;
  /** Fetch author for a post (used by {% get_author %} tag). */
  get_author?: (idOrSlug: string | number) => Promise<ThemeAuthorView | null>;
  content?: string;
};

export type ResolvedPublicRoute = {
  kind: ThemeRouteKind;
  locale: string;
  path: string;
  slug?: string;
  postType?: string;
  page?: number;
  taxonomyType?: string;
  taxonomySlug?: string;
  taxonomyBase?: string;
};
