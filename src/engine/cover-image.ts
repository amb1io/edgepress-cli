import { buildMediaUrl, type MediaSize } from "./media-urls.ts";

export type CoverImagePostInput = {
  meta_values?: Record<string, unknown>;
  media?: Array<{ id?: number; meta_values?: Record<string, unknown> }>;
};

export type CoverImageAttachmentCache = Map<number, string | undefined>;

export type FetchAttachmentMeta = (id: number) => Promise<Record<string, unknown> | null>;

export function parsePostThumbnailId(metaValues: Record<string, unknown>): number | null {
  const raw = metaValues["post_thumbnail_id"];
  const id =
    typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function resolveMediaPathToAbsoluteUrl(path: string, baseUrl: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized =
    path.startsWith("/uploads/") || path.startsWith("/")
      ? path.startsWith("/")
        ? path
        : `/${path}`
      : `/uploads/${path.replace(/^uploads\//, "")}`;
  return new URL(`/api/media${normalized}`, baseUrl).href;
}

function attachmentPathFromMeta(meta: Record<string, unknown>): string {
  return (
    (typeof meta["attachment_path"] === "string" && meta["attachment_path"]) ||
    (typeof meta["attachment_file"] === "string" && meta["attachment_file"]) ||
    ""
  );
}

function applyCoverSize(url: string | undefined, size: MediaSize): string | undefined {
  if (!url) return undefined;
  return buildMediaUrl(url, size) ?? url;
}

function resolveCoverImageFromMetaPath(
  metaValues: Record<string, unknown>,
  baseUrl: string,
  size: MediaSize = "medium",
): string | undefined {
  const thumbPath = metaValues["post_thumbnail_path"];
  if (typeof thumbPath !== "string" || !thumbPath.trim()) return undefined;
  return applyCoverSize(resolveMediaPathToAbsoluteUrl(thumbPath.trim(), baseUrl), size);
}

/** Resolves cover from linked `post.media` (posts_media). */
export function resolveCoverImageFromMedia(
  post: CoverImagePostInput,
  baseUrl: string,
  size: MediaSize = "medium",
): string | undefined {
  const media = Array.isArray(post.media) ? post.media : [];
  const thumbId = parsePostThumbnailId((post.meta_values ?? {}) as Record<string, unknown>);

  for (const item of media) {
    const row = item as { id?: number; meta_values?: Record<string, unknown> };
    if (thumbId != null && row.id !== thumbId) continue;
    const path = attachmentPathFromMeta(row.meta_values ?? {});
    if (!path) continue;
    return applyCoverSize(resolveMediaPathToAbsoluteUrl(path, baseUrl), size);
  }
  return undefined;
}

/** Resolves theme cover URL: media links, meta path, then optional attachment fetch. */
export async function resolveCoverImage(
  post: CoverImagePostInput,
  baseUrl: string,
  attachmentCache: CoverImageAttachmentCache,
  fetchAttachmentMeta?: FetchAttachmentMeta,
  size: MediaSize = "medium",
): Promise<string | undefined> {
  const fromMedia = resolveCoverImageFromMedia(post, baseUrl, size);
  if (fromMedia) return fromMedia;

  const metaValues = (post.meta_values ?? {}) as Record<string, unknown>;
  const fromMetaPath = resolveCoverImageFromMetaPath(metaValues, baseUrl, size);
  if (fromMetaPath) return fromMetaPath;

  const thumbId = parsePostThumbnailId(metaValues);
  if (thumbId == null || !fetchAttachmentMeta) return undefined;

  if (attachmentCache.has(thumbId)) {
    return applyCoverSize(attachmentCache.get(thumbId), size);
  }

  const attachmentMeta = await fetchAttachmentMeta(thumbId);
  if (!attachmentMeta) {
    attachmentCache.set(thumbId, undefined);
    return undefined;
  }

  const path = attachmentPathFromMeta(attachmentMeta);
  const originalUrl = path ? resolveMediaPathToAbsoluteUrl(path, baseUrl) : undefined;
  attachmentCache.set(thumbId, originalUrl);
  return applyCoverSize(originalUrl, size);
}

/** Sync cover resolution from media links and meta path (no attachment fetch). */
export function resolveCoverImageSync(
  post: CoverImagePostInput,
  baseUrl: string,
  size: MediaSize = "medium",
): string | undefined {
  const fromMedia = resolveCoverImageFromMedia(post, baseUrl, size);
  if (fromMedia) return fromMedia;
  return resolveCoverImageFromMetaPath(
    (post.meta_values ?? {}) as Record<string, unknown>,
    baseUrl,
    size,
  );
}
