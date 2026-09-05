import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { AppConfig, Competitor, CompetitorSources } from "./types.js";
import { DEFAULT_FETCH_DELAY_MS, DEFAULT_USER_AGENT } from "./types.js";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function normalizeCompetitor(raw: Record<string, unknown>, index: number): Competitor {
  const name = String(raw.name ?? `competitor-${index + 1}`);
  const id = String(raw.id ?? slugify(name));
  const sourcesRaw = (raw.sources ?? {}) as Record<string, unknown>;
  const sources: CompetitorSources = {};
  for (const key of ["website", "changelog", "blog", "pricing"] as const) {
    const v = sourcesRaw[key];
    if (typeof v === "string" && v.trim()) {
      sources[key] = v.trim();
    }
  }
  return {
    id,
    name,
    sources,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
  };
}

export function loadConfig(configPath: string): AppConfig {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config not found: ${resolved}`);
  }
  const doc = yaml.load(fs.readFileSync(resolved, "utf8")) as Record<string, unknown>;
  if (!doc || typeof doc !== "object") {
    throw new Error("Config must be a YAML object");
  }
  const list = Array.isArray(doc.competitors) ? doc.competitors : [];
  const competitors = list.map((c, i) =>
    normalizeCompetitor(c as Record<string, unknown>, i)
  );
  return {
    competitors,
    fetchDelayMs:
      typeof doc.fetchDelayMs === "number" ? doc.fetchDelayMs : DEFAULT_FETCH_DELAY_MS,
    userAgent:
      typeof doc.userAgent === "string" && doc.userAgent.trim()
        ? doc.userAgent.trim()
        : DEFAULT_USER_AGENT,
  };
}

export function saveConfig(configPath: string, config: AppConfig): void {
  const resolved = path.resolve(configPath);
  const dir = path.dirname(resolved);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    fetchDelayMs: config.fetchDelayMs ?? DEFAULT_FETCH_DELAY_MS,
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
    competitors: config.competitors.map((c) => ({
      id: c.id,
      name: c.name,
      notes: c.notes,
      sources: c.sources,
    })),
  };
  fs.writeFileSync(resolved, yaml.dump(payload, { lineWidth: 100 }), "utf8");
}

export function defaultConfigPath(): string {
  return process.env.COMPETITORPULSE_CONFIG ?? "./competitors.yaml";
}

export function defaultDataDir(): string {
  return process.env.COMPETITORPULSE_DATA ?? "./data";
}

export function ensureExampleConfig(dest: string, examplePath: string): void {
  if (fs.existsSync(dest)) return;
  if (!fs.existsSync(examplePath)) return;
  fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
  fs.copyFileSync(examplePath, dest);
}
