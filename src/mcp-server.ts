#!/usr/bin/env node
/**
 * CompetitorPulse MCP server (stdio).
 * Tools: add/list/remove competitors, run check, get digest/changes.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  defaultConfigPath,
  defaultDataDir,
  ensureExampleConfig,
  loadConfig,
  saveConfig,
} from "./config.js";
import { runCheck } from "./check.js";
import { Store } from "./store.js";
import type { Competitor, CompetitorSources } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function cfgAndStore() {
  const cfgPath = defaultConfigPath();
  ensureExampleConfig(
    cfgPath,
    path.join(ROOT, "examples", "competitors.example.yaml")
  );
  return {
    cfgPath,
    config: loadConfig(cfgPath),
    store: new Store(defaultDataDir()),
  };
}

const server = new Server(
  { name: "competitorpulse", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_competitors",
      description: "List configured competitors and their watched source URLs.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "add_competitor",
      description:
        "Add a competitor with optional website, changelog, blog (RSS/Atom), and pricing URLs. LinkedIn URLs are rejected.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          id: { type: "string", description: "Optional stable id" },
          website: { type: "string" },
          changelog: { type: "string" },
          blog: { type: "string" },
          pricing: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
    {
      name: "remove_competitor",
      description: "Remove a competitor by id.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    {
      name: "run_check",
      description:
        "Fetch watched sources, compute meaningful diffs, classify changes, and write Markdown digests.",
      inputSchema: {
        type: "object",
        properties: {
          competitor_ids: {
            type: "array",
            items: { type: "string" },
            description: "Optional subset of competitor ids",
          },
          include_baselines: {
            type: "boolean",
            description: "Include first-seen baselines in digests",
          },
        },
        additionalProperties: false,
      },
    },
    {
      name: "get_digest",
      description: "Return the latest Markdown digest (combined or per competitor).",
      inputSchema: {
        type: "object",
        properties: {
          competitor_id: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    {
      name: "get_changes",
      description: "Return recent change records as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          competitor_id: { type: "string" },
          limit: { type: "number" },
        },
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const name = request.params.name;
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "list_competitors": {
        const { config } = cfgAndStore();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(config.competitors, null, 2),
            },
          ],
        };
      }
      case "add_competitor": {
        const { config, cfgPath } = cfgAndStore();
        const displayName = String(args.name ?? "");
        if (!displayName) throw new Error("name is required");
        const id =
          (args.id as string | undefined) ??
          displayName
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        if (config.competitors.some((c) => c.id === id)) {
          throw new Error(`Competitor already exists: ${id}`);
        }
        const sources: CompetitorSources = {};
        for (const key of ["website", "changelog", "blog", "pricing"] as const) {
          if (typeof args[key] === "string" && (args[key] as string).trim()) {
            sources[key] = (args[key] as string).trim();
          }
        }
        const competitor: Competitor = {
          id,
          name: displayName,
          sources,
          notes: typeof args.notes === "string" ? args.notes : undefined,
        };
        config.competitors.push(competitor);
        saveConfig(cfgPath, config);
        return {
          content: [{ type: "text", text: JSON.stringify(competitor, null, 2) }],
        };
      }
      case "remove_competitor": {
        const { config, cfgPath } = cfgAndStore();
        const id = String(args.id ?? "");
        const before = config.competitors.length;
        config.competitors = config.competitors.filter((c) => c.id !== id);
        if (config.competitors.length === before) {
          throw new Error(`Not found: ${id}`);
        }
        saveConfig(cfgPath, config);
        return { content: [{ type: "text", text: `Removed ${id}` }] };
      }
      case "run_check": {
        const { config, store } = cfgAndStore();
        const ids = Array.isArray(args.competitor_ids)
          ? (args.competitor_ids as string[])
          : undefined;
        const result = await runCheck(config, store, {
          competitorIds: ids,
          includeBaselinesInDigest: Boolean(args.include_baselines),
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  changeCount: result.changes.length,
                  errors: result.errors,
                  combinedMarkdown: result.combined.markdown,
                },
                null,
                2
              ),
            },
          ],
        };
      }
      case "get_digest": {
        const { store } = cfgAndStore();
        const competitorId =
          typeof args.competitor_id === "string" ? args.competitor_id : undefined;
        const md = store.getLatestDigestMarkdown(competitorId);
        if (!md) {
          return {
            content: [
              {
                type: "text",
                text: "No digest found. Call run_check first.",
              },
            ],
            isError: true,
          };
        }
        return { content: [{ type: "text", text: md }] };
      }
      case "get_changes": {
        const { store } = cfgAndStore();
        const competitorId =
          typeof args.competitor_id === "string" ? args.competitor_id : undefined;
        const limit = typeof args.limit === "number" ? args.limit : 50;
        const changes = store.loadChanges(competitorId, limit);
        return {
          content: [{ type: "text", text: JSON.stringify(changes, null, 2) }],
        };
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: msg }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
