import fs from "node:fs";
import path from "node:path";
import type { ThemeManifest, ThemePackageRecord } from "../engine/types.ts";
import { normalizeTemplateKey } from "../engine/resolve-template.ts";

function collectLiquidTemplates(templatesDir: string): Record<string, string> {
  const templates: Record<string, string> = {};

  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith(".liquid")) continue;
      const relative = path.relative(templatesDir, fullPath).replace(/\\/g, "/");
      const key = normalizeTemplateKey(`templates/${relative}`);
      templates[key] = fs.readFileSync(fullPath, "utf8");
    }
  }

  if (!fs.existsSync(templatesDir)) {
    throw new Error(`templates/ directory not found in ${templatesDir}`);
  }

  walk(templatesDir);
  return templates;
}

export function validateThemeManifest(raw: unknown): ThemeManifest {
  if (!raw || typeof raw !== "object") {
    throw new Error("theme.json must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const name = String(obj.name ?? "").trim();
  const slug = String(obj.slug ?? "").trim().toLowerCase();
  const version = String(obj.version ?? "1.0.0").trim();
  const engine = String(obj.engine ?? "liquid").trim();
  if (engine !== "liquid") {
    throw new Error(`Unsupported theme engine: ${engine}`);
  }
  if (!name || !slug) {
    throw new Error("theme.json requires name and slug");
  }
  const templates =
    obj.templates && typeof obj.templates === "object"
      ? (obj.templates as ThemeManifest["templates"])
      : {};
  const supports = Array.isArray(obj.supports)
    ? obj.supports.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : ["single", "page", "archive", "home"];

  return {
    name,
    slug,
    version,
    engine: "liquid",
    supports,
    templates,
    ...(typeof obj.layout === "string" ? { layout: obj.layout } : {}),
    ...(typeof obj.assets_dir === "string" ? { assets_dir: obj.assets_dir } : {}),
    ...(typeof obj.home_content_key === "string"
      ? { home_content_key: obj.home_content_key }
      : {}),
    ...(obj.home_list_posts === true ? { home_list_posts: true } : {}),
  };
}

export function loadThemePackage(themeDir: string): ThemePackageRecord {
  const manifestPath = path.join(themeDir, "theme.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`theme.json not found in ${themeDir}`);
  }

  const manifest = validateThemeManifest(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")),
  );
  const templates = collectLiquidTemplates(path.join(themeDir, "templates"));

  if (Object.keys(templates).length === 0) {
    throw new Error("No templates/*.liquid files found");
  }

  return {
    manifest,
    templates,
    updated_at: Date.now(),
  };
}

export function loadThemeAssets(themeDir: string): Map<string, ArrayBuffer> {
  const assetsDir = path.join(themeDir, manifestAssetsDir(themeDir));
  const assets = new Map<string, ArrayBuffer>();
  if (!fs.existsSync(assetsDir)) return assets;

  function walk(relativeRoot: string): void {
    const abs = path.join(assetsDir, relativeRoot);
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      const buf = fs.readFileSync(abs);
      assets.set(
        relativeRoot.replace(/\\/g, "/"),
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      );
      return;
    }
    for (const name of fs.readdirSync(abs)) {
      walk(path.join(relativeRoot, name));
    }
  }

  for (const name of fs.readdirSync(assetsDir)) {
    walk(name);
  }

  return assets;
}

function manifestAssetsDir(themeDir: string): string {
  const manifestPath = path.join(themeDir, "theme.json");
  if (!fs.existsSync(manifestPath)) return "assets";
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { assets_dir?: string };
    return raw.assets_dir?.trim() || "assets";
  } catch {
    return "assets";
  }
}

export function resolveThemeDir(cwd: string, themeDir?: string): string {
  const dir = themeDir ? path.resolve(cwd, themeDir) : cwd;
  if (!fs.existsSync(path.join(dir, "theme.json"))) {
    throw new Error(
      `No theme.json found in ${dir}. Run "edgepress theme create" or pass --theme-dir.`,
    );
  }
  return dir;
}
