import type { ChangeCategory, SourceKind } from "./types.js";

const PRICING_HINTS =
  /\b(pric(e|ing)|plan|tier|subscription|per[- ]?(seat|user|month|year)|\$\d|usd|billing|discount|free trial|enterprise plan)\b/i;

const FEATURE_HINTS =
  /\b(feature|launch(ed)?|releas(e|ed)|changelog|now (support|available)|introduc(e|ing)|api|integration|beta|ga\b|generally available|new:?)\b/i;

const BLOG_HINTS =
  /\b(blog|announc(e|ement)|post|article|newsletter|webinar|podcast|case study)\b/i;

/**
 * Classify a change using source kind + content heuristics.
 * Source kind is a strong prior; text signals refine it.
 */
export function classifyChange(
  sourceKind: SourceKind,
  textSample: string,
  diffExcerpt = ""
): ChangeCategory {
  const hay = `${textSample}\n${diffExcerpt}`.slice(0, 8000);

  // Strong priors from source kind
  if (sourceKind === "pricing") {
    return "pricing";
  }
  if (sourceKind === "blog") {
    // Blog feed updates are blog unless clearly pricing-only
    if (PRICING_HINTS.test(hay) && !BLOG_HINTS.test(hay) && !FEATURE_HINTS.test(hay)) {
      return "pricing";
    }
    return "blog";
  }
  if (sourceKind === "changelog") {
    if (PRICING_HINTS.test(hay) && !FEATURE_HINTS.test(hay)) return "pricing";
    return "feature";
  }

  // website / other: score heuristics
  const scores: Record<ChangeCategory, number> = {
    pricing: 0,
    feature: 0,
    blog: 0,
    other: 0.1,
  };
  if (PRICING_HINTS.test(hay)) scores.pricing += 2;
  if (FEATURE_HINTS.test(hay)) scores.feature += 2;
  if (BLOG_HINTS.test(hay)) scores.blog += 1.5;

  // Dollar amounts boost pricing
  if (/\$\d{1,3}(?:,\d{3})*(?:\.\d+)?/.test(hay)) scores.pricing += 1;

  let best: ChangeCategory = "other";
  let bestScore = -1;
  for (const [k, v] of Object.entries(scores) as [ChangeCategory, number][]) {
    if (v > bestScore) {
      bestScore = v;
      best = k;
    }
  }
  return best;
}

/** One-line summary from category + diff stats. */
export function summarizeChangeLocally(
  category: ChangeCategory,
  sourceKind: SourceKind,
  added: number,
  removed: number,
  excerpt: string
): string {
  const firstPlus = excerpt
    .split("\n")
    .find((l) => l.startsWith("+ "))
    ?.slice(2)
    .trim();
  const hint = firstPlus ? `: "${firstPlus.slice(0, 120)}${firstPlus.length > 120 ? "…" : ""}"` : "";
  const stats = `+${added}/-${removed} lines`;
  switch (category) {
    case "pricing":
      return `Pricing-related change on ${sourceKind} (${stats})${hint}`;
    case "feature":
      return `Feature / product update on ${sourceKind} (${stats})${hint}`;
    case "blog":
      return `Blog / content update on ${sourceKind} (${stats})${hint}`;
    default:
      return `Content change on ${sourceKind} (${stats})${hint}`;
  }
}
