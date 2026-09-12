# CompetitorPulse

**Competitive-intel change-digest agent + MCP server.**

Watch competitor websites, changelogs, blog feeds (RSS/Atom), and pricing pages.

Fetches politely, meaningful diffs, classifies pricing/feature/blog/other, Markdown digests.
CLI and MCP server. Self-host free MIT; hosted Pro later.

## Value proposition

| Pain | CompetitorPulse |
|------|-----------------|
| Manual site checks | Automated fetch + digest via CLI/MCP |
| Noisy HTML diffs | Normalized text + two-pass semantic noise filtering |
| Unclear meaning | Category labels + optional LLM summary |
| Scattered notes | YAML config + Markdown digests on disk |

Blocked by design: LinkedIn URLs (ToS / politeness).

## Quickstart

Install deps, copy the example YAML to competitors.yaml, then run tests, typecheck, list, check, and digest via package scripts.

Example: use package scripts install, test, check, cli, mcp, and build.


### CLI

- list / add / remove competitors
- check (fetch, diff, classify, write digests)
- digest (print latest)
- changes (recent records)

Env: COMPETITORPULSE_CONFIG, COMPETITORPULSE_DATA, OPENAI_API_KEY, OPENAI_MODEL.

### MCP server

Stdio tools: list_competitors, add_competitor, remove_competitor, run_check, get_digest, get_changes.

Start via package script mcp (tsx on src/mcp-server.ts). Configure Cursor mcp.json with cwd plus config/data env paths. After tsc build, run node on dist/mcp-server.js.

## Two-pass semantic verify

Line diffs still fire on date footers, view counters, and CDN asset hashes.
After `meaningfulDiff`, CompetitorPulse runs a **second pass** that:

- Normalizes dates / counters / hashed asset URLs
- Detects pure sentence reorders
- Attaches structured signals (`price_change`, `feature_mention`, …)
- Adds a one-line **what it means** interpretation (no LLM required)

Cosmetic churn is dropped before classify/store/digest — fewer Visualping-style false positives.

## Architecture

YAML -> CLI/MCP -> check orchestrator -> fetch -> normalize -> meaningful diff -> classify -> store -> Markdown digest (optional LLM summary) -> data/digests/

Modules: config, fetch, diff, classify, store, digest, summarize, check, cli, mcp-server, index.

## Example config

See examples/competitors.example.yaml (northstar-analytics, riverbed-crm, lighthouse-docs).

## Monetization

Self-host free MIT now. Hosted Pro later (schedules, teams, Slack/email). Distribution via Gumroad, Apify, MCP marketplaces.

## Development

Run install, test, check, and build via package scripts. Tests cover diff, classify, and URL policy.

## Limitations (MVP)

Main-content HTML heuristics only (no headless browser). First fetch is baseline. Rule-based classify; LLM summary only with API key. No built-in cron. Polite delay 750ms and identifiable User-Agent; respect site policies.

## License

MIT (c) 2026 Vinay Vik — see LICENSE.
