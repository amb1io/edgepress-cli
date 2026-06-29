import fs from "node:fs";
import path from "node:path";
import { createTarGzip } from "nanotar";
import { Command } from "commander";
import { resolveThemeDir, validateThemeManifest } from "../loader/theme-loader.ts";

function collectThemeFiles(themeDir: string): Array<{ name: string; data: Uint8Array }> {
  const entries: Array<{ name: string; data: Uint8Array }> = [];

  function walk(relativeRoot: string): void {
    const abs = path.join(themeDir, relativeRoot);
    if (!fs.existsSync(abs)) return;

    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      entries.push({
        name: relativeRoot.replace(/\\/g, "/"),
        data: new Uint8Array(fs.readFileSync(abs)),
      });
      return;
    }

    for (const name of fs.readdirSync(abs)) {
      walk(path.join(relativeRoot, name));
    }
  }

  walk("theme.json");
  walk("templates");
  walk("assets");

  return entries;
}

export function registerThemeBuildCommand(theme: Command): void {
  theme
    .command("build")
    .description("Package theme as .tar.gz for upload to EdgePress")
    .option("--theme-dir <dir>", "Theme directory (default: cwd)")
    .option("--out <file>", "Output archive path")
    .action(async (opts: { themeDir?: string; out?: string }) => {
      const cwd = process.cwd();
      const themeDir = resolveThemeDir(cwd, opts.themeDir);
      const manifest = validateThemeManifest(
        JSON.parse(fs.readFileSync(path.join(themeDir, "theme.json"), "utf8")),
      );

      const files = collectThemeFiles(themeDir);
      if (!files.some((f) => f.name === "theme.json")) {
        throw new Error("theme.json is required in the package");
      }
      if (!files.some((f) => f.name.startsWith("templates/") && f.name.endsWith(".liquid"))) {
        throw new Error("At least one templates/*.liquid file is required");
      }

      const archive = await createTarGzip(files);
      const outPath = opts.out
        ? path.resolve(cwd, opts.out)
        : path.join(cwd, `${manifest.slug}.tar.gz`);

      fs.writeFileSync(outPath, Buffer.from(archive));
      console.log(`[edgepress] Built ${outPath}`);
    });
}
