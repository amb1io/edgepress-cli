/**
 * Resolução de slugs/nomes traduzidos de taxonomias (sem acesso direto ao DB).
 * Connect: usa `/api/i18n/{locale}` + listagem de taxonomias.
 * Mock: fixtures locais por locale.
 */
import type { AuthenticatedClient } from "../auth/handshake.ts";
import { fetchJson } from "../auth/handshake.ts";
import { normalizePublicLocale, publicLocaleToDbCode } from "./resolve-route.ts";

export const TAXONOMY_TYPE_I18N_PREFIX = "taxonomy.type.";
export const TAXONOMY_SLUG_I18N_PREFIX = "taxonomy.slug.";

export type TaxonomyTermLike = {
  id?: number;
  name: string;
  slug: string;
  type: string;
};

export type TaxonomyTranslationResolver = {
  resolveTermBySlug(taxonomyType: string, slugOrTranslated: string): Promise<TaxonomyTermLike | null>;
  resolveCanonicalSlugForFilter(
    taxonomyType: string,
    slugOrTranslated: string,
  ): Promise<string | null>;
  getLocalizedSlug(canonicalSlug: string, targetPublicLocale: string): Promise<string>;
  localizeTerm(term: TaxonomyTermLike): Promise<{ name: string; slug: string }>;
  localizeTerms(terms: TaxonomyTermLike[]): Promise<TaxonomyTermLike[]>;
  localizeTaxonomyType(
    taxonomyType: string,
  ): Promise<{ name: string; slug: string; original_name: string; original_slug: string }>;
};

type ApiTaxonomyRow = {
  id?: number;
  name?: string;
  slug?: string;
  type?: string;
  parent_id?: number | null;
};

function toTerm(row: ApiTaxonomyRow, taxonomyType: string): TaxonomyTermLike {
  return {
    id: row.id,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    type: String(row.type ?? taxonomyType),
  };
}

function localizedName(i18n: Record<string, string>, canonicalSlug: string, fallback: string): string {
  return i18n[`${TAXONOMY_TYPE_I18N_PREFIX}${canonicalSlug}`]?.trim() || fallback;
}

function localizedSlug(i18n: Record<string, string>, canonicalSlug: string): string {
  return i18n[`${TAXONOMY_SLUG_I18N_PREFIX}${canonicalSlug}`]?.trim() || canonicalSlug;
}

function publicLocaleFromDbCode(dbLocale: string): string {
  if (dbLocale === "pt_BR") return "pt-br";
  if (dbLocale === "en_US") return "en";
  if (dbLocale === "es_ES") return "es";
  return normalizePublicLocale(dbLocale);
}

export function createConnectTaxonomyTranslationResolver(
  client: AuthenticatedClient,
  dbLocale: string,
): TaxonomyTranslationResolver {
  let i18nCache: Record<string, string> | null = null;
  const termsByType = new Map<string, ApiTaxonomyRow[]>();

  async function loadI18n(): Promise<Record<string, string>> {
    if (i18nCache) return i18nCache;
    const publicLocale = publicLocaleFromDbCode(dbLocale);
    try {
      i18nCache = await fetchJson<Record<string, string>>(
        client,
        `/api/i18n/${encodeURIComponent(publicLocale)}`,
      );
    } catch {
      i18nCache = {};
    }
    return i18nCache;
  }

  async function loadTerms(taxonomyType: string): Promise<ApiTaxonomyRow[]> {
    const cached = termsByType.get(taxonomyType);
    if (cached) return cached;
    try {
      const list = await fetchJson<{ items?: ApiTaxonomyRow[] }>(
        client,
        `/api/content/taxonomies?filter_type=${encodeURIComponent(taxonomyType)}&limit=500`,
      );
      const items = list.items ?? [];
      termsByType.set(taxonomyType, items);
      return items;
    } catch {
      termsByType.set(taxonomyType, []);
      return [];
    }
  }

  async function resolveTermBySlug(
    taxonomyType: string,
    slugOrTranslated: string,
  ): Promise<TaxonomyTermLike | null> {
    const input = slugOrTranslated.trim();
    if (!input) return null;

    const terms = await loadTerms(taxonomyType);
    const i18n = await loadI18n();

    const direct = terms.find((row) => String(row.slug ?? "") === input);
    if (direct) return toTerm(direct, taxonomyType);

    for (const row of terms) {
      const canonical = String(row.slug ?? "").trim();
      if (!canonical) continue;
      if (localizedSlug(i18n, canonical) === input) {
        return toTerm(row, taxonomyType);
      }
    }

    return null;
  }

  return {
    resolveTermBySlug,
    async resolveCanonicalSlugForFilter(taxonomyType, slugOrTranslated) {
      const term = await resolveTermBySlug(taxonomyType, slugOrTranslated);
      return term?.slug ?? null;
    },
    async getLocalizedSlug(canonicalSlug, targetPublicLocale) {
      const key = canonicalSlug.trim();
      if (!key) return "";
      const targetDb = publicLocaleToDbCode(targetPublicLocale);
      if (targetDb === dbLocale) {
        const i18n = await loadI18n();
        return localizedSlug(i18n, key);
      }
      try {
        const i18n = await fetchJson<Record<string, string>>(
          client,
          `/api/i18n/${encodeURIComponent(normalizePublicLocale(targetPublicLocale))}`,
        );
        return localizedSlug(i18n, key);
      } catch {
        return key;
      }
    },
    async localizeTerm(term) {
      const i18n = await loadI18n();
      const canonical = term.slug.trim();
      return {
        name: localizedName(i18n, canonical, term.name),
        slug: localizedSlug(i18n, canonical),
      };
    },
    async localizeTerms(terms) {
      const i18n = await loadI18n();
      return terms.map((term) => {
        const canonical = term.slug.trim();
        return {
          ...term,
          name: localizedName(i18n, canonical, term.name),
          slug: localizedSlug(i18n, canonical),
        };
      });
    },
    async localizeTaxonomyType(taxonomyType) {
      const i18n = await loadI18n();
      const canonical = taxonomyType.trim();
      const terms = await loadTerms(taxonomyType);
      const root = terms.find((row) => row.parent_id == null || row.parent_id === 0);
      const original_name = root?.name ? String(root.name) : canonical;
      const original_slug = root?.slug ? String(root.slug) : canonical;
      return {
        name: localizedName(i18n, canonical, original_name),
        slug: localizedSlug(i18n, canonical),
        original_name,
        original_slug,
      };
    },
  };
}

type MockTranslationEntry = {
  names?: Record<string, string>;
  slugs?: Record<string, string>;
};

const MOCK_TYPE_ORIGINALS: Record<string, { original_name: string; original_slug: string }> = {
  category: { original_name: "Category", original_slug: "category" },
};

const MOCK_TYPE_TRANSLATIONS: Record<string, Record<string, { name: string; slug: string }>> = {
  category: {
    "pt-br": { name: "Categorias", slug: "category" },
    en: { name: "Categories", slug: "category" },
  },
};

const MOCK_TERM_TRANSLATIONS: Record<string, Record<string, MockTranslationEntry>> = {
  category: {
    "sample-term": {
      names: { "pt-br": "Exemplo", en: "Sample" },
      slugs: { "pt-br": "sample-term", en: "sample-en" },
    },
    tecnologia: {
      names: { "pt-br": "Tecnologia", en: "Technology" },
      slugs: { "pt-br": "tecnologia", en: "technology" },
    },
  },
};

export function createMockTaxonomyTranslationResolver(
  publicLocale: string,
): TaxonomyTranslationResolver {
  const locale = normalizePublicLocale(publicLocale);

  function mockLocalized(canonical: string, field: "names" | "slugs", fallback: string): string {
    const entry = MOCK_TERM_TRANSLATIONS.category?.[canonical] ?? MOCK_TERM_TRANSLATIONS.tag?.[canonical];
    return entry?.[field]?.[locale] ?? fallback;
  }

  async function resolveTermBySlug(
    taxonomyType: string,
    slugOrTranslated: string,
  ): Promise<TaxonomyTermLike | null> {
    const input = slugOrTranslated.trim();
    if (!input) return null;

    const typeEntries = MOCK_TERM_TRANSLATIONS[taxonomyType] ?? {};
    for (const [canonical, entry] of Object.entries(typeEntries)) {
      if (canonical === input) {
        return {
          name: entry.names?.[locale] ?? canonical,
          slug: canonical,
          type: taxonomyType,
        };
      }
      const translatedSlug = entry.slugs?.[locale];
      if (translatedSlug === input) {
        return {
          name: entry.names?.[locale] ?? canonical,
          slug: canonical,
          type: taxonomyType,
        };
      }
    }

    const staticNames: Record<string, Record<string, string>> = {
      category: { tecnologia: "Tecnologia", design: "Design", "sample-term": "Exemplo" },
      tag: { javascript: "javascript" },
    };
    const name = staticNames[taxonomyType]?.[input];
    if (name) {
      return { name, slug: input, type: taxonomyType };
    }

    return null;
  }

  return {
    resolveTermBySlug,
    async resolveCanonicalSlugForFilter(taxonomyType, slugOrTranslated) {
      const term = await resolveTermBySlug(taxonomyType, slugOrTranslated);
      return term?.slug ?? null;
    },
    async getLocalizedSlug(canonicalSlug, targetPublicLocale) {
      const target = normalizePublicLocale(targetPublicLocale);
      const entry =
        MOCK_TERM_TRANSLATIONS.category?.[canonicalSlug] ??
        MOCK_TERM_TRANSLATIONS.tag?.[canonicalSlug];
      return entry?.slugs?.[target] ?? canonicalSlug;
    },
    async localizeTerm(term) {
      const canonical = term.slug.trim();
      return {
        name: mockLocalized(canonical, "names", term.name),
        slug: mockLocalized(canonical, "slugs", canonical),
      };
    },
    async localizeTerms(terms) {
      return Promise.all(
        terms.map(async (term) => ({
          ...term,
          ...(await this.localizeTerm(term)),
        })),
      );
    },
    async localizeTaxonomyType(taxonomyType) {
      const canonical = taxonomyType.trim();
      const localized = MOCK_TYPE_TRANSLATIONS[canonical]?.[locale] ?? {
        name: canonical,
        slug: canonical,
      };
      const original = MOCK_TYPE_ORIGINALS[canonical] ?? {
        original_name: canonical,
        original_slug: canonical,
      };
      return { ...localized, ...original };
    },
  };
}
