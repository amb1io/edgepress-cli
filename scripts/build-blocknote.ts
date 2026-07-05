import * as esbuild from "esbuild";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const outFile = join(root, "dist/blocknote/blocknote-readonly.js");

mkdirSync(dirname(outFile), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, "src/blocknote/mount.tsx")],
  bundle: true,
  outfile: outFile,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  conditions: ["style", "import", "module", "browser", "default"],
  loader: { ".css": "css" },
  logLevel: "info",
});

console.log(`[build:blocknote] Wrote ${outFile}`);
