import { watch } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { AuthenticatedClient } from "../auth/handshake.ts";
import { renderTheme, resetLiquidForTests } from "../engine/render.ts";
import { resolvePublicRoute } from "../engine/resolve-route.ts";
import type { ThemePackageRecord, ThemeRenderContext } from "../engine/types.ts";
import {
  loadThemeAssets,
  loadThemePackage,
} from "../loader/theme-loader.ts";
import { buildConnectedContext } from "./connect-client.ts";
import { buildMockContext } from "./mock-context.ts";

const RELOAD_PATH = "/__theme_dev/events";
const WATCHABLE = /\.(liquid|json|css|js|svg|png|jpe?g|webp)$/i;

export type ThemeDevServerOptions = {
  themeDir: string;
  port: number;
  connectClient?: AuthenticatedClient | null;
};

export function startThemeDevServer(options: ThemeDevServerOptions): void {
  const { themeDir, port, connectClient } = options;
  let themePackage = loadThemePackage(themeDir);
  const reloadClients = new Set<ServerResponse>();

  function reloadThemePackage(reason: string): void {
    resetLiquidForTests();
    themePackage = loadThemePackage(themeDir);
    console.log(`[edgepress] reload (${reason})`);
    for (const client of reloadClients) {
      client.write("data: reload\n\n");
    }
  }

  function startThemeWatcher(): void {
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = (filename: string) => {
      if (!WATCHABLE.test(filename)) return;
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => reloadThemePackage(filename), 120);
    };

    const onWatchEvent = (_event: string, filename: string | null) => {
      if (filename) scheduleReload(filename);
    };

    try {
      watch(themeDir, { recursive: true }, onWatchEvent);
      console.log(`[edgepress] watching ${themeDir}`);
      return;
    } catch {
      // Linux: recursive pode falhar
    }

    watch(join(themeDir, "templates"), { recursive: true }, onWatchEvent);
    watch(join(themeDir, "assets"), onWatchEvent);
    watch(join(themeDir, "theme.json"), onWatchEvent);
    console.log(`[edgepress] watching ${themeDir} (templates, assets, theme.json)`);
  }

  function injectLiveReload(html: string): string {
    const script = `<script>
(function () {
  var es = new EventSource(${JSON.stringify(RELOAD_PATH)});
  es.onmessage = function () { location.reload(); };
  es.onerror = function () { es.close(); setTimeout(function () { location.reload(); }, 1500); };
})();
</script>`;
    if (html.includes("</body>")) {
      return html.replace("</body>", `${script}</body>`);
    }
    return `${html}${script}`;
  }

  function serveSse(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    reloadClients.add(res);
    res.on("close", () => reloadClients.delete(res));
  }

  async function buildContext(url: URL, route: ReturnType<typeof resolvePublicRoute>): Promise<ThemeRenderContext> {
    if (connectClient) {
      return buildConnectedContext(connectClient, url, route, themePackage);
    }
    return buildMockContext(url, route, themePackage);
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      const pathname = url.pathname;

      if (pathname === RELOAD_PATH) {
        serveSse(res);
        return;
      }

      if (pathname.startsWith("/themes-assets/")) {
        const assetPath = pathname.replace(/^\/themes-assets\/[^/]+\//, "");
        const assets = loadThemeAssets(themeDir);
        const file = assets.get(assetPath);
        if (!file) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const contentType = assetPath.endsWith(".css")
          ? "text/css; charset=utf-8"
          : assetPath.endsWith(".js")
            ? "application/javascript; charset=utf-8"
            : "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-store",
        });
        res.end(Buffer.from(file));
        return;
      }

      const route = resolvePublicRoute(pathname, url.searchParams);
      const ctx = await buildContext(url, route);
      const html = injectLiveReload(await renderTheme(themePackage, ctx));

      res.writeHead(ctx.route.kind === "404" ? 404 : 200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
    } catch (err) {
      console.error(err);
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(err instanceof Error ? err.message : "Theme dev error");
    }
  });

  server.listen(port, () => {
    startThemeWatcher();
    console.log(`[edgepress] http://localhost:${port}`);
    if (connectClient) {
      console.log(`[edgepress] Connected to ${connectClient.origin} (${connectClient.email})`);
    } else {
      console.log("[edgepress] Static preview — pass --connect <url> for live CMS data");
    }
  });
}
