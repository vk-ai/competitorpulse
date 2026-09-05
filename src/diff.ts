import { createHash } from "node:crypto";
import { createTwoFilesPatch, diffLines } from "diff";

export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export interface DiffResult {
  changed: boolean;
  /** Unified diff string (may be empty if unchanged). */
  unified: string;
  /** Short human-readable excerpt of meaningful added/removed lines. */
  excerpt: string;
  addedLines: number;
  removedLines: number;
}

const NOISE_LINE =
  /^(cookie|privacy|©|copyright|all rights reserved|sign in|log in|subscribe|newsletter)/i;

function isMeaningfulLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3) return false;
  if (NOISE_LINE.test(t)) return false;
  // Skip pure navigation crumbs
  if (/^(home|about|contact|blog|docs)\s*[>|/]/i.test(t) && t.length < 40) {
    return false;
  }
  return true;
}

/**
 * Compute a meaningful text diff between previous and current normalized content.
 * Ignores trivial whitespace-only and common boilerplate line changes.
 */
export function meaningfulDiff(before: string, after: string, label = "content"): DiffResult {
  if (before === after) {
    return { changed: false, unified: "", excerpt: "", addedLines: 0, removedLines: 0 };
  }

  const changes = diffLines(before, after);
  const added: string[] = [];
  const removed: string[] = [];

  for (const part of changes) {
    const lines = part.value.split("\n").filter((l) => l.length > 0 || part.value.endsWith("\n"));
    for (const line of lines) {
      if (!isMeaningfulLine(line)) continue;
      if (part.added) added.push(line);
      else if (part.removed) removed.push(line);
    }
  }

  // If after noise filtering nothing meaningful remains, treat as unchanged
  if (added.length === 0 && removed.length === 0) {
    // Still hash-different (e.g. whitespace) — report as not meaningfully changed
    return { changed: false, unified: "", excerpt: "", addedLines: 0, removedLines: 0 };
  }

  const unified = createTwoFilesPatch(
    `${label}.before`,
    `${label}.after`,
    before,
    after,
    undefined,
    undefined,
    { context: 2 }
  );

  const excerptLines: string[] = [];
  for (const l of removed.slice(0, 12)) excerptLines.push(`- ${l.trim()}`);
  for (const l of added.slice(0, 12)) excerptLines.push(`+ ${l.trim()}`);
  if (removed.length > 12 || added.length > 12) {
    excerptLines.push(
      `… (${Math.max(0, removed.length - 12)} more removals, ${Math.max(0, added.length - 12)} more additions)`
    );
  }

  return {
    changed: true,
    unified,
    excerpt: excerptLines.join("\n"),
    addedLines: added.length,
    removedLines: removed.length,
  };
}
