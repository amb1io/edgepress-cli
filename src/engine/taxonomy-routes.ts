/**
 * WordPress-style taxonomy archive URLs for the public theme.
 *
 * URL base → DB taxonomy type (built-in):
 *   /category/{slug} → type `category`
 *   /tag/{slug}      → type `tag`
 *
 * Custom taxonomy types (phase 2): extend TAXONOMY_URL_BASES or map via taxonomy-type-registry.
 */

/** WordPress permalink segment → `edp_taxonomies.type`. */
export const TAXONOMY_URL_BASES: Record<string, string> = {
  category: "category",
  tag: "tag",
};

export type ResolvedTaxonomyRoute = {
  taxonomyBase: string;
  taxonomyType: string;
  termSlug: string;
};

export function resolveTaxonomyUrlBase(segment: string): string | null {
  const key = segment.trim().toLowerCase();
  return key in TAXONOMY_URL_BASES ? key : null;
}

export function resolveTaxonomyFromSegments(segments: string[]): ResolvedTaxonomyRoute | null {
  if (segments.length !== 2) return null;
  const taxonomyBase = resolveTaxonomyUrlBase(segments[0] ?? "");
  if (!taxonomyBase) return null;
  const termSlug = (segments[1] ?? "").trim();
  if (!termSlug) return null;
  return {
    taxonomyBase,
    taxonomyType: TAXONOMY_URL_BASES[taxonomyBase]!,
    termSlug,
  };
}

export function buildTaxonomyPublicPath(
  taxonomyBase: string,
  termSlug: string,
  localePrefix: string,
): string {
  const prefix = localePrefix.replace(/\/+$/, "");
  return `${prefix}/${taxonomyBase}/${termSlug}`;
}

/** Maps DB taxonomy type to URL segment (category/tag use fixed bases; custom types use type slug). */
export function taxonomyTypeToUrlBase(type: string): string {
  const entry = Object.entries(TAXONOMY_URL_BASES).find(([, t]) => t === type);
  return entry?.[0] ?? type;
}
