#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import {
  defaultConfigPath,
  defaultDataDir,
  loadConfig,
  saveConfig,
  ensureExampleConfig,
} from "./config.js";
import { runCheck } from "./check.js";
import { Store } from "./store.js";
import type { Competitor, CompetitorSources } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function getStore(): Store {
  return new Store(defaultDataDir());
}

function getConfig() {
  const cfgPath = defaultConfigPath();
  ensureExampleConfig(
    cfgPath,
    path.join(ROOT, "examples", "competitors.example.yaml")
  );
  return { config: loadConfig(cfgPath), cfgPath };
}

const program = new Command();
program
  .name("competitorpulse")
  .description("Competitive-intel change-digest agent")
  .version("0.1.0");

program
  .command("list")
  .description("List configured competitors")
  .action(() => {
    const { config } = getConfig();
    if (!config.competitors.length) {
      console.log("No competitors configured.");
      return;
    }
    for (const c of config.competitors) {
      const sources = Object.entries(c.sources)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(", ");
      console.log(`- ${c.id}: ${c.name} [${sources || "no sources"}]`);
    }
  });

program
  .command("add")
  .description("Add a competitor")
  .requiredOption("--name <name>", "Display name")
  .option("--id <id>", "Stable id (slug); derived from name if omitted")
  .option("--website <url>", "Website URL")
  .option("--changelog <url>", "Changelog URL")
  .option("--blog <url>", "Blog RSS/Atom or HTML URL")
  .option("--pricing <url>", "Pricing page URL")
  .option("--notes <text>", "Optional notes")
  .action((opts) => {
    const { config, cfgPath } = getConfig();
    const id =
      opts.id ??
      String(opts.name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    if (config.competitors.some((c) => c.id === id)) {
      console.error(`Competitor already exists: ${id}`);
      process.exitCode = 1;
      return;
    }
    const sources: CompetitorSources = {};
    if (opts.website) sources.website = opts.website;
    if (opts.changelog) sources.changelog = opts.changelog;
    if (opts.blog) sources.blog = opts.blog;
    if (opts.pricing) sources.pricing = opts.pricing;
    const competitor: Competitor = {
      id,
      name: opts.name,
      sources,
      notes: opts.notes,
    };
    config.competitors.push(competitor);
    saveConfig(cfgPath, config);
    console.log(`Added ${id}`);
  });

program
  .command("remove")
  .description("Remove a competitor by id")
  .argument("<id>", "Competitor id")
  .action((id: string) => {
    const { config, cfgPath } = getConfig();
    const before = config.competitors.length;
    config.competitors = config.competitors.filter((c) => c.id !== id);
    if (config.competitors.length === before) {
      console.error(`Not found: ${id}`);
      process.exitCode = 1;
      return;
    }
    saveConfig(cfgPath, config);
    console.log(`Removed ${id}`);
  });

program
  .command("check")
  .description("Fetch all sources, diff, classify, and write digests")
  .option("--competitor <id>", "Limit to one competitor id", (v, acc: string[]) => {
    acc.push(v);
    return acc;
  }, [] as string[])
  .option("--include-baselines", "Include first-seen baselines in digests", false)
  .action(async (opts) => {
    const { config } = getConfig();
    const store = getStore();
    const result = await runCheck(config, store, {
      competitorIds: opts.competitor.length ? opts.competitor : undefined,
      includeBaselinesInDigest: opts.includeBaselines,
    });
    console.log(
      `Check complete: ${result.changes.length} change(s), ${result.errors.length} error(s)`
    );
    for (const e of result.errors) {
      console.error(`  ! ${e.competitorId}/${e.sourceKind}: ${e.error}`);
    }
    console.log("\n--- Combined digest ---\n");
    console.log(result.combined.markdown);
  });

program
  .command("digest")
  .description("Print the latest digest (combined or per competitor)")
  .option("--competitor <id>", "Competitor id")
  .action((opts) => {
    const store = getStore();
    const md = store.getLatestDigestMarkdown(opts.competitor);
    if (!md) {
      console.error("No digest found. Run `competitorpulse check` first.");
      process.exitCode = 1;
      return;
    }
    console.log(md);
  });

program
  .command("changes")
  .description("List recent recorded changes")
  .option("--competitor <id>", "Competitor id")
  .option("--limit <n>", "Max rows", "20")
  .action((opts) => {
    const store = getStore();
    const list = store.loadChanges(opts.competitor, Number(opts.limit) || 20);
    if (!list.length) {
      console.log("No changes recorded yet.");
      return;
    }
    for (const c of list) {
      console.log(
        `${c.detectedAt}  ${c.competitorId}  [${c.category}/${c.sourceKind}]  ${c.summary}`
      );
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
