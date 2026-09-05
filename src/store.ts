import fs from "node:fs";
import path from "node:path";
import type { ChangeRecord, Digest, Snapshot, SourceKind } from "./types.js";

export class Store {
  constructor(private dataDir: string) {
    fs.mkdirSync(path.join(this.dataDir, "snapshots"), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, "changes"), { recursive: true });
    fs.mkdirSync(path.join(this.dataDir, "digests"), { recursive: true });
  }

  private snapshotPath(competitorId: string, sourceKind: SourceKind): string {
    return path.join(this.dataDir, "snapshots", `${competitorId}__${sourceKind}.json`);
  }

  private changesPath(competitorId?: string): string {
    return path.join(
      this.dataDir,
      "changes",
      competitorId ? `${competitorId}.json` : "_all.json"
    );
  }

  loadSnapshot(competitorId: string, sourceKind: SourceKind): Snapshot | null {
    const p = this.snapshotPath(competitorId, sourceKind);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as Snapshot;
  }

  saveSnapshot(snapshot: Snapshot): void {
    const p = this.snapshotPath(snapshot.competitorId, snapshot.sourceKind);
    fs.writeFileSync(p, JSON.stringify(snapshot, null, 2), "utf8");
  }

  appendChange(change: ChangeRecord): void {
    for (const id of [change.competitorId, undefined] as const) {
      const p = this.changesPath(id);
      const list = this.loadChanges(id);
      list.unshift(change);
      // Keep last 500
      fs.writeFileSync(p, JSON.stringify(list.slice(0, 500), null, 2), "utf8");
    }
  }

  loadChanges(competitorId?: string, limit = 100): ChangeRecord[] {
    const p = this.changesPath(competitorId);
    if (!fs.existsSync(p)) return [];
    const list = JSON.parse(fs.readFileSync(p, "utf8")) as ChangeRecord[];
    return list.slice(0, limit);
  }

  saveDigest(digest: Digest): string {
    const stamp = digest.generatedAt.replace(/[:.]/g, "-");
    const name = digest.competitorId
      ? `${digest.competitorId}_${stamp}.md`
      : `combined_${stamp}.md`;
    const p = path.join(this.dataDir, "digests", name);
    fs.writeFileSync(p, digest.markdown, "utf8");
    // Also write "latest" pointers
    const latest = digest.competitorId
      ? path.join(this.dataDir, "digests", `${digest.competitorId}_latest.md`)
      : path.join(this.dataDir, "digests", "combined_latest.md");
    fs.writeFileSync(latest, digest.markdown, "utf8");
    // JSON sidecar for MCP
    fs.writeFileSync(p.replace(/\.md$/, ".json"), JSON.stringify(digest, null, 2), "utf8");
    fs.writeFileSync(latest.replace(/\.md$/, ".json"), JSON.stringify(digest, null, 2), "utf8");
    return p;
  }

  loadLatestDigest(competitorId?: string): Digest | null {
    const p = competitorId
      ? path.join(this.dataDir, "digests", `${competitorId}_latest.json`)
      : path.join(this.dataDir, "digests", "combined_latest.json");
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as Digest;
  }

  getLatestDigestMarkdown(competitorId?: string): string | null {
    const p = competitorId
      ? path.join(this.dataDir, "digests", `${competitorId}_latest.md`)
      : path.join(this.dataDir, "digests", "combined_latest.md");
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, "utf8");
  }
}
