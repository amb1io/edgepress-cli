#!/usr/bin/env node
import { Command } from "commander";
import { registerThemeBuildCommand } from "./commands/theme-build.ts";
import { registerThemeCreateCommand } from "./commands/theme-create.ts";
import { registerThemeDevCommand } from "./commands/theme-dev.ts";

const program = new Command();

program
  .name("edgepress")
  .description("EdgePress CLI — develop and package Liquid themes")
  .version("0.1.0");

const theme = program.command("theme").description("Theme development commands");

registerThemeDevCommand(theme);
registerThemeBuildCommand(theme);
registerThemeCreateCommand(theme);

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
