/** Change classification categories. */
export type ChangeCategory = "pricing" | "feature" | "blog" | "other";

/** Source kinds we watch per competitor. */
export type SourceKind = "website" | "changelog" | "blog" | "pricing";

export interface CompetitorSources {
  website?: string;
  changelog?: string;
  blog?: string;
  pricing?: string;
}

/** Per-source extraction filters applied before diffing (see src/filters.ts). */
export interface SourceFilter {
  /** CSS selectors; when set, only text inside matching elements is kept. */
  include?: string[];
  /** CSS selectors removed before text extraction. */
  exclude?: string[];
  /** Regex patterns; matching text lines are dropped. Case-insensitive unless `/re/flags`. */
  ignore?: string[];
}

export interface Competitor {
  id: string;
  name: string;
  sources: CompetitorSources;
  /** Optional per-source include/exclude selectors and ignore patterns. */
  filters?: Partial<Record<SourceKind, SourceFilter>>;
  notes?: string;
}

export interface AppConfig {
  competitors: Competitor[];
  /** Optional polite delay between fetches (ms). Default 750. */
  fetchDelayMs?: number;
  /** User-Agent string. */
  userAgent?: string;
}

export interface Snapshot {
  competitorId: string;
  sourceKind: SourceKind;
  url: string;
  fetchedAt: string;
  /** Normalized text content used for diffing. */
  text: string;
  /** Content hash for quick equality checks. */
  hash: string;
  /** Hash of the source filter used to extract `text` ("" or absent = none). */
  filterKey?: string;
}

export interface ChangeRecord {
  id: string;
  competitorId: string;
  competitorName: string;
  sourceKind: SourceKind;
  url: string;
  category: ChangeCategory;
  detectedAt: string;
  summary: string;
  /** Unified diff excerpt (truncated). */
  diffExcerpt: string;
  /** Whether content appeared for the first time (baseline). */
  isBaseline?: boolean;
}

export interface Digest {
  generatedAt: string;
  competitorId?: string;
  competitorName?: string;
  markdown: string;
  changes: ChangeRecord[];
}

export const DEFAULT_USER_AGENT =
  "CompetitorPulse/0.1 (+https://github.com/vk-ai/competitorpulse; polite competitive-intel bot; contact via GitHub issues)";

export const DEFAULT_FETCH_DELAY_MS = 750;
