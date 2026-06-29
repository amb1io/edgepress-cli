import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command } from "commander";

const STARTER_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scaffold/starter",
);

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

export function registerThemeCreateCommand(theme: Command): void {
  theme
    .command("create")
    .description("Scaffold a new EdgePress Liquid theme")
    .option("--name <name>", "Theme display name")
    .option("--slug <slug>", "Theme slug")
    .option("--dir <dir>", "Output directory (default: cwd)")
    .action(async (opts: { name?: string; slug?: string; dir?: string }) => {
      const targetDir = path.resolve(process.cwd(), opts.dir ?? ".");

      if (fs.existsSync(path.join(targetDir, "theme.json"))) {
        throw new Error(`theme.json already exists in ${targetDir}`);
      }

      const rl = createInterface({ input, output });
      let name = opts.name?.trim() ?? "";
      let slug = opts.slug?.trim() ?? "";

      try {
        if (!name) {
          name = (await rl.question("Theme name: ")).trim();
        }
        if (!slug) {
          const suggested = slugify(name) || "my-theme";
          const answer = (await rl.question(`Theme slug [${suggested}]: `)).trim();
          slug = answer || suggested;
        }
      } finally {
        rl.close();
      }

      slug = slugify(slug);
      if (!slug) {
        throw new Error("Theme slug is required");
      }

      copyDir(STARTER_DIR, targetDir);

      const manifestPath = path.join(targetDir, "theme.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
      manifest.name = name;
      manifest.slug = slug;
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

      console.log(`[edgepress] Theme scaffolded in ${targetDir}`);
      console.log(`[edgepress] Next: edgepress theme dev --theme-dir ${targetDir === process.cwd() ? "." : targetDir}`);
    });
}
