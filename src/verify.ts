import type { DiffResult } from "./diff.js";

/**
 * Second-pass semantic verification after line-level meaningfulDiff.
 * Drops Visualping-style false positives: date footers, view counters,
 * CDN/asset hash churn, pure reorders of the same sentences.
 */

export interface SemanticVerdict {
  /** False when the first-pass diff is cosmetic / not actionable. */
  meaningful: boolean;
  /** Stable machine reason for digests and tests. */
  reason: string;
  /** Structured hints (price_change, feature_mention, ...). */
  signals: string[];
  /** One-line "what it means" without calling an LLM. */
  interpretation: string;
}

const DATE_ONLY =
  /\b(?:last\s+updated|updated|published|posted|as of)\b[:\s-]*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi;

const COUNTER =
  /\b\d{1,3}(?:,\d{3})*\s*(?:views?|claps?|likes?|shares?|comments?|readers?)\b/gi;

const ASSET_HASH =
  /(?:\/|_|\.)(?:[a-f0-9]{8,}|v\d+)(?:\.[a-z0-9]+)+/gi;

const PRICE =
  /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*\/\s*(?:mo|month|yr|year|seat|user))?/gi;

function normalizeForSemantics(text: string): string {
  return text
    .replace(DATE_ONLY, "〈DATE〉")
    .replace(COUNTER, "〈COUNT〉")
    .replace(ASSET_HASH, "〈ASSET〉")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function sentenceBag(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 8)
    .sort();
}

function collectSignals(excerpt: string, after: string): string[] {
  const hay = `${excerpt}\n${after}`.slice(0, 12_000);
  const signals: string[] = [];
  if (PRICE.test(hay)) signals.push("price_change");
  PRICE.lastIndex = 0;
  if (/\b(launch(ed)?|releas(e|ed)|now (available|support)|generally available|beta)\b/i.test(hay)) {
    signals.push("feature_mention");
  }
  if (/\b(deprecat|sunset|end of (life|support)|discontinu)\b/i.test(hay)) {
    signals.push("deprecation");
  }
  if (/\b(pric(e|ing)|plan|tier|billing)\b/i.test(hay) && !signals.includes("price_change")) {
    signals.push("pricing_language");
  }
  return signals;
}

function interpret(signals: string[], diff: DiffResult): string {
  if (signals.includes("price_change")) {
    return "Likely pricing or plan amount change — review the pricing page.";
  }
  if (signals.includes("deprecation")) {
    return "Possible deprecation / sunset language — check impact on customers.";
  }
  if (signals.includes("feature_mention")) {
    return "Looks like a product/feature update — skim the added lines.";
  }
  if (signals.includes("pricing_language")) {
    return "Pricing-related wording shifted without a clear $ amount — confirm manually.";
  }
  return `Substantive content edit (+${diff.addedLines}/-${diff.removedLines} meaningful lines).`;
}

/**
 * Two-pass verify: given a first-pass DiffResult that claims `changed`,
 * decide whether the change is semantically meaningful.
 */
export function verifySemanticChange(
  before: string,
  after: string,
  diff: DiffResult
): SemanticVerdict {
  if (!diff.changed) {
    return {
      meaningful: false,
      reason: "first_pass_unchanged",
      signals: [],
      interpretation: "No meaningful line-level change.",
    };
  }

  const normBefore = normalizeForSemantics(before);
  const normAfter = normalizeForSemantics(after);
  if (normBefore === normAfter) {
    return {
      meaningful: false,
      reason: "cosmetic_normalized_equal",
      signals: [],
      interpretation:
        "Only dates, counters, or asset hashes moved — treated as noise.",
    };
  }

  const bagBefore = sentenceBag(normalizeForSemantics(before)).join("\n");
  const bagAfter = sentenceBag(normalizeForSemantics(after)).join("\n");
  if (bagBefore === bagAfter && bagBefore.length > 0) {
    return {
      meaningful: false,
      reason: "reorder_only",
      signals: [],
      interpretation: "Same sentences reordered — treated as noise.",
    };
  }

  // Tiny diffs that are only punctuation / casing after normalization
  if (
    Math.abs(normBefore.length - normAfter.length) < 8 &&
    normBefore.replace(/[^a-z0-9]+/g, "") === normAfter.replace(/[^a-z0-9]+/g, "")
  ) {
    return {
      meaningful: false,
      reason: "punctuation_or_casing",
      signals: [],
      interpretation: "Punctuation/casing only — treated as noise.",
    };
  }

  const signals = collectSignals(diff.excerpt, after);
  return {
    meaningful: true,
    reason: "substantive",
    signals,
    interpretation: interpret(signals, diff),
  };
}
