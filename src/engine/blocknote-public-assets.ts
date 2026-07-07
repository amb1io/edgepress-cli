/** Dev-server paths for the BlockNote readonly bundle (see scripts/build-blocknote.ts). */
export type BlockNotePublicAssets = {
  js: string;
  css: string;
};

export function getBlockNotePublicAssets(): BlockNotePublicAssets | null {
  return {
    js: "/edgepress-assets/blocknote-readonly.js",
    css: "/edgepress-assets/blocknote-readonly.css",
  };
}
