import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import type { SourceFilter } from "./types.js";

/**
 * Per-source filters, applied before diffing:
 *
 * - `include`: CSS selectors. When set, only the text of matching elements is
 *   kept (document order). If none match, the fetch fails loudly instead of
 *   diffing an empty page.
 * - `exclude`: CSS selectors removed before extraction (testimonials, cookie
 *   banners, "customers" counters, ...).
 * - `ignore`: regex patterns. Any text line matching one is dropped. Patterns
 *   are case-insensitive; use `/pattern/flags` to set flags explicitly.
 *
 * Selectors apply to HTML sources; `ignore` applies to every source,
 * including RSS/Atom text.
 */

const SLASH_FORM = /^\/(.+)\/([a-z]*)$/s;

export function compileIgnorePattern(pattern: string): RegExp {
  const m = SLASH_FORM.exec(pattern);
  try {
    if (m) {
      const flags = m[2]!.replace(/[gy]/g, "");
      return new RegExp(m[1]!, flags);
    }
    return new RegExp(pattern, "i");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ignore pattern ${JSON.stringify(pattern)}: ${msg}`);
  }
}

function assertSelector(selector: string): void {
  const $ = cheerio.load("<div></div>");
  try {
    $(selector);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid CSS selector ${JSON.stringify(selector)}: ${msg}`);
  }
}

function stringList(raw: unknown, field: string, where: string): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  const list = typeof raw === "string" ? [raw] : raw;
  if (!Array.isArray(list) || list.some((v) => typeof v !== "string")) {
    throw new Error(`${where}: '${field}' must be a string or a list of strings`);
  }
  const cleaned = (list as string[]).map((s) => s.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

/** Validate and normalize a filter block from YAML. Returns undefined when empty. */
export function parseSourceFilter(
  raw: Record<string, unknown>,
  where: string
): SourceFilter | undefined {
  const include = stringList(raw.include, "include", where);
  const exclude = stringList(raw.exclude, "exclude", where);
  const ignore = stringList(raw.ignore, "ignore", where);
  include?.forEach(assertSelector);
  exclude?.forEach(assertSelector);
  ignore?.forEach(compileIgnorePattern);
  if (!include && !exclude && !ignore) return undefined;
  const out: SourceFilter = {};
  if (include) out.include = include;
  if (exclude) out.exclude = exclude;
  if (ignore) out.ignore = ignore;
  return out;
}

export function hasFilter(filter: SourceFilter | undefined): filter is SourceFilter {
  return Boolean(
    filter && (filter.include?.length || filter.exclude?.length || filter.ignore?.length)
  );
}

/**
 * Stable key for a filter config. Stored on snapshots so a filter change
 * re-baselines the source instead of reporting a giant false-positive diff.
 * Empty string means "no filters" (matches snapshots written before filters).
 */
export function filterKey(filter: SourceFilter | undefined): string {
  if (!hasFilter(filter)) return "";
  const canonical = JSON.stringify({
    include: filter.include ?? [],
    exclude: filter.exclude ?? [],
    ignore: filter.ignore ?? [],
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** Drop lines that match any ignore pattern. */
export function applyIgnorePatterns(text: string, patterns: string[] | undefined): string {
  if (!patterns?.length) return text;
  const regexes = patterns.map(compileIgnorePattern);
  return text
    .split("\n")
    .filter((line) => !regexes.some((re) => re.test(line)))
    .join("\n");
}
