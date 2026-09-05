import { randomUUID } from "node:crypto";
import type {
  AppConfig,
  ChangeRecord,
  Competitor,
  Digest,
  SourceKind,
  Snapshot,
} from "./types.js";
import { contentHash, meaningfulDiff } from "./diff.js";
import { classifyChange, summarizeChangeLocally } from "./classify.js";
import { fetchNormalized } from "./fetch.js";
import { buildDigest } from "./digest.js";
import { Store } from "./store.js";

const SOURCE_KINDS: SourceKind[] = ["website", "changelog", "blog", "pricing"];

export interface CheckResult {
  changes: ChangeRecord[];
  digests: Digest[];
  combined: Digest;
  errors: { competitorId: string; sourceKind: SourceKind; error: string }[];
}

async function checkSource(
  competitor: Competitor,
  sourceKind: SourceKind,
  url: string,
  config: AppConfig,
  store: Store
): Promise<{ change: ChangeRecord | null; error?: string }> {
  try {
    const { text, finalUrl } = await fetchNormalized(url, sourceKind, {
      userAgent: config.userAgent,
      delayMs: config.fetchDelayMs,
    });
    const hash = contentHash(text);
    const prev = store.loadSnapshot(competitor.id, sourceKind);
    const now = new Date().toISOString();

    const snapshot: Snapshot = {
      competitorId: competitor.id,
      sourceKind,
      url: finalUrl || url,
      fetchedAt: now,
      text,
      hash,
    };

    if (!prev) {
      store.saveSnapshot(snapshot);
      const change: ChangeRecord = {
        id: randomUUID(),
        competitorId: competitor.id,
        competitorName: competitor.name,
        sourceKind,
        url: finalUrl || url,
        category: classifyChange(sourceKind, text, ""),
        detectedAt: now,
        summary: `Baseline captured for ${sourceKind}`,
        diffExcerpt: text.slice(0, 400),
        isBaseline: true,
      };
      store.appendChange(change);
      return { change };
    }

    if (prev.hash === hash) {
      // Touch fetchedAt optionally — keep previous text
      store.saveSnapshot({ ...snapshot, text: prev.text });
      return { change: null };
    }

    const diff = meaningfulDiff(prev.text, text, `${competitor.id}-${sourceKind}`);
    store.saveSnapshot(snapshot);

    if (!diff.changed) {
      return { change: null };
    }

    const category = classifyChange(sourceKind, text, diff.excerpt);
    const summary = summarizeChangeLocally(
      category,
      sourceKind,
      diff.addedLines,
      diff.removedLines,
      diff.excerpt
    );

    const change: ChangeRecord = {
      id: randomUUID(),
      competitorId: competitor.id,
      competitorName: competitor.name,
      sourceKind,
      url: finalUrl || url,
      category,
      detectedAt: now,
      summary,
      diffExcerpt: diff.excerpt,
    };
    store.appendChange(change);
    return { change };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { change: null, error: msg };
  }
}

export async function runCheck(
  config: AppConfig,
  store: Store,
  opts: { competitorIds?: string[]; includeBaselinesInDigest?: boolean } = {}
): Promise<CheckResult> {
  const targets = opts.competitorIds?.length
    ? config.competitors.filter((c) => opts.competitorIds!.includes(c.id))
    : config.competitors;

  const changes: ChangeRecord[] = [];
  const errors: CheckResult["errors"] = [];
  const digests: Digest[] = [];

  for (const competitor of targets) {
    const perComp: ChangeRecord[] = [];
    for (const kind of SOURCE_KINDS) {
      const url = competitor.sources[kind];
      if (!url) continue;
      const { change, error } = await checkSource(
        competitor,
        kind,
        url,
        config,
        store
      );
      if (error) {
        errors.push({ competitorId: competitor.id, sourceKind: kind, error });
      }
      if (change) {
        // Digests usually skip pure baselines unless requested
        if (!change.isBaseline || opts.includeBaselinesInDigest) {
          perComp.push(change);
          changes.push(change);
        } else {
          // Still recorded in store; omit from digest list
        }
      }
    }
    const digest = await buildDigest(perComp, {
      competitorId: competitor.id,
      competitorName: competitor.name,
    });
    store.saveDigest(digest);
    digests.push(digest);
  }

  const combined = await buildDigest(changes);
  store.saveDigest(combined);

  return { changes, digests, combined, errors };
}
