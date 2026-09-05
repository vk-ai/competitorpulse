import * as cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";
import type { SourceKind } from "./types.js";
import { DEFAULT_USER_AGENT } from "./types.js";

const BLOCKED_HOST_PATTERNS = [
  /(^|\.)linkedin\.com$/i,
  /(^|\.)lnkd\.in$/i,
];

export function assertAllowedUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`Only http(s) URLs are allowed: ${url}`);
  }
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(parsed.hostname))) {
    throw new Error(
      `LinkedIn scraping is not supported (ToS / politeness). URL blocked: ${url}`
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchRaw(
  url: string,
  opts: { userAgent?: string; timeoutMs?: number } = {}
): Promise<{ contentType: string; body: string; finalUrl: string }> {
  assertAllowedUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": opts.userAgent ?? DEFAULT_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml,application/rss+xml,application/atom+xml,text/xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    const contentType = res.headers.get("content-type") ?? "text/plain";
    const body = await res.text();
    return { contentType, body, finalUrl: res.url };
  } finally {
    clearTimeout(timeout);
  }
}

/** Collapse whitespace and strip boilerplate-ish noise for stable diffs. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function extractHtmlMainText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, iframe, nav, footer, header").remove();
  // Prefer main/article if present
  const main = $("main, article, [role='main']").first();
  const root = main.length ? main : $("body");
  // Insert newlines for common block elements so words do not run together
  $("br").replaceWith("\n");
  $("p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article").each((_, el) => {
    $(el).append("\n");
  });
  const text = root.text() || $.root().text();
  return normalizeText(text);
}

function extractFeedText(xml: string): string {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
  });
  const doc = parser.parse(xml);
  const lines: string[] = [];

  // RSS 2.0
  const rssItems = doc?.rss?.channel?.item;
  if (rssItems) {
    const items = Array.isArray(rssItems) ? rssItems : [rssItems];
    const channel = doc.rss.channel;
    if (channel?.title) lines.push(`Feed: ${channel.title}`);
    for (const item of items.slice(0, 30)) {
      const title = item.title ?? "(untitled)";
      const date = item.pubDate ?? item["dc:date"] ?? "";
      const link = item.link ?? "";
      const desc = typeof item.description === "string"
        ? cheerio.load(item.description).text()
        : "";
      lines.push(`- ${title}${date ? ` [${date}]` : ""}${link ? ` <${link}>` : ""}`);
      if (desc) lines.push(`  ${normalizeText(desc).slice(0, 400)}`);
    }
    return normalizeText(lines.join("\n"));
  }

  // Atom
  const feed = doc?.feed;
  if (feed) {
    if (feed.title) {
      const t = typeof feed.title === "string" ? feed.title : feed.title["#text"];
      if (t) lines.push(`Feed: ${t}`);
    }
    const entries = feed.entry
      ? Array.isArray(feed.entry)
        ? feed.entry
        : [feed.entry]
      : [];
    for (const entry of entries.slice(0, 30)) {
      const title =
        typeof entry.title === "string"
          ? entry.title
          : entry.title?.["#text"] ?? "(untitled)";
      const updated = entry.updated ?? entry.published ?? "";
      let link = "";
      if (typeof entry.link === "string") link = entry.link;
      else if (entry.link?.["@_href"]) link = entry.link["@_href"];
      else if (Array.isArray(entry.link)) {
        const alt = entry.link.find((l: { "@_rel"?: string }) => !l["@_rel"] || l["@_rel"] === "alternate");
        link = alt?.["@_href"] ?? entry.link[0]?.["@_href"] ?? "";
      }
      const summaryRaw = entry.summary ?? entry.content;
      const summary =
        typeof summaryRaw === "string"
          ? cheerio.load(summaryRaw).text()
          : typeof summaryRaw?.["#text"] === "string"
            ? cheerio.load(summaryRaw["#text"]).text()
            : "";
      lines.push(`- ${title}${updated ? ` [${updated}]` : ""}${link ? ` <${link}>` : ""}`);
      if (summary) lines.push(`  ${normalizeText(summary).slice(0, 400)}`);
    }
    return normalizeText(lines.join("\n"));
  }

  // Fallback: treat as plain XML text
  return normalizeText(cheerio.load(xml).text() || xml);
}

export async function fetchNormalized(
  url: string,
  sourceKind: SourceKind,
  opts: { userAgent?: string; delayMs?: number } = {}
): Promise<{ text: string; contentType: string; finalUrl: string }> {
  if (opts.delayMs && opts.delayMs > 0) {
    await sleep(opts.delayMs);
  }
  const { contentType, body, finalUrl } = await fetchRaw(url, {
    userAgent: opts.userAgent,
  });
  const ct = contentType.toLowerCase();
  let text: string;

  if (
    sourceKind === "blog" ||
    ct.includes("xml") ||
    ct.includes("rss") ||
    ct.includes("atom") ||
    body.trimStart().startsWith("<?xml") ||
    /<(rss|feed)\b/i.test(body.slice(0, 500))
  ) {
    // Blog sources prefer feed parsing; HTML blogs fall through to HTML extract
    if (
      ct.includes("xml") ||
      ct.includes("rss") ||
      ct.includes("atom") ||
      body.trimStart().startsWith("<?xml") ||
      /<(rss|feed)\b/i.test(body.slice(0, 500))
    ) {
      text = extractFeedText(body);
    } else {
      text = extractHtmlMainText(body);
    }
  } else if (ct.includes("html") || /<html[\s>]/i.test(body.slice(0, 1000))) {
    text = extractHtmlMainText(body);
  } else {
    text = normalizeText(body);
  }

  return { text, contentType, finalUrl };
}
