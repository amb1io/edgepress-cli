/**
 * Taxonomy helpers for the public theme (DB lookups).
 * URL routing is file-based; taxonomy type is the first static URL segment.
 */

export type PublicTaxonomyTerm = {
  id?: number;
  name: string;
  slug: string;
  type: string;
};

export function buildTaxonomyPublicPath(
  taxonomyType: string,
  termSlug: string,
  localePrefix: string,
): string {
  const prefix = localePrefix.replace(/\/+$/, "");
  return `${prefix}/${taxonomyType}/${termSlug}`;
}
