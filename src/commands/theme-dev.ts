import { Command } from "commander";
import { authenticateSite } from "../auth/handshake.ts";
import { startThemeDevServer } from "../dev/server.ts";
import { resolveThemeDir } from "../loader/theme-loader.ts";

export function registerThemeDevCommand(theme: Command): void {
  theme
    .command("dev")
    .description("Start local theme preview with hot reload")
    .option("--theme-dir <dir>", "Theme directory (default: cwd)")
    .option("--port <port>", "Dev server port", "4322")
    .option("--connect <url>", "Connect to EdgePress site for live API data")
    .option("--email <email>", "Email for --connect handshake")
    .option("--password <password>", "Password for --connect handshake")
    .action(async (opts: {
      themeDir?: string;
      port: string;
      connect?: string;
      email?: string;
      password?: string;
    }) => {
      const cwd = process.cwd();
      const themeDir = resolveThemeDir(cwd, opts.themeDir);
      const port = Number(opts.port) || 4322;

      let connectClient = null;
      if (opts.connect) {
        connectClient = await authenticateSite(opts.connect, {
          email: opts.email,
          password: opts.password,
        });
      }

      startThemeDevServer({ themeDir, port, connectClient });
    });
}
