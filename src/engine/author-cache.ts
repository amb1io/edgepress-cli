import type { ThemeAuthorView } from "./types.ts";

export function buildAuthorCacheKey(userId: string): string {
  const id = userId.trim();
  return `author:user:${id}`;
}

export type AuthorCacheStore = {
  get(key: string): ThemeAuthorView | null;
  set(key: string, author: ThemeAuthorView): void;
  delete(key: string): void;
};

export function createMemoryAuthorCacheStore(): AuthorCacheStore {
  const store = new Map<string, ThemeAuthorView>();
  return {
    get(key) {
      return store.get(key) ?? null;
    },
    set(key, author) {
      store.set(key, author);
    },
    delete(key) {
      store.delete(key);
    },
  };
}

/** Shared in-process cache for CLI dev preview and --connect. */
export const devAuthorCache = createMemoryAuthorCacheStore();
