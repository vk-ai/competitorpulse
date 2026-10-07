import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extractHtmlMainText, applySourceFilter, normalizeText } from "../src/fetch.ts";
import {
  applyIgnorePatterns,
  compileIgnorePattern,
  filterKey,
  parseSourceFilter,
} from "../src/filters.ts";
import { loadConfig, saveConfig } from "../src/config.ts";
import { runCheck } from "../src/check.ts";
import { Store } from "../src/store.ts";
import type { AppConfig } from "../src/types.ts";

function pricingPage(opts: { price?: string; testimonial?: string; customers?: string } = {}) {
  return `<!doctype html><html><head><title>Pricing</title></head><body>
  <header><nav>Home · Pricing</nav><span class="promo">Spring sale</span></header>
  <main>
    <section class="pricing-table">
      <h2>Starter</h2><p class="price">${opts.price ?? "$9/mo"}</p>
      <h2>Pro</h2><p class="price">$29/mo</p>
    </section>
    <section class="testimonials"><p>${opts.testimonial ?? "Great tool! — Ana"}</p></section>
    <p class="social">Trusted by ${opts.customers ?? "1,204"} customers</p>
    <p>Last updated March 3</p>
  </main>
  <footer>© 2026</footer>
  </body></html>`;
}

describe("extractHtmlMainText with filters", () => {
  it("is unchanged without a filter (main heuristic, chrome stripped)", () => {
    const text = extractHtmlMainText(pricingPage());
    assert.match(text, /Starter/);
    assert.match(text, /Great tool/);
    assert.doesNotMatch(text, /Spring sale|© 2026/);
    // applySourceFilter is a no-op on already-normalized text without a filter
    assert.equal(applySourceFilter(text), text);
    assert.equal(normalizeText(text), text);
  });

  it("include keeps only matching elements", () => {
    const text = extractHtmlMainText(pricingPage(), { include: [".pricing-table"] });
    assert.match(text, /Starter\s+\$9\/mo/);
    assert.doesNotMatch(text, /Great tool|customers|Last updated/);
  });

  it("include can target elements inside header and de-duplicates nested matches", () => {
    const text = extractHtmlMainText(pricingPage(), {
      include: [".promo", ".pricing-table", ".pricing-table .price"],
    });
    assert.match(text, /Spring sale/);
    assert.equal(text.match(/\$29\/mo/g)?.length, 1);
  });

  it("exclude removes elements before extraction", () => {
    const text = extractHtmlMainText(pricingPage(), { exclude: [".testimonials", ".social"] });
    assert.match(text, /Starter/);
    assert.doesNotMatch(text, /Great tool|customers/);
  });

  it("throws when include matches nothing (selector drift)", () => {
    assert.throws(
      () => extractHtmlMainText(pricingPage(), { include: [".plans-v2"] }),
      /matched nothing/
    );
  });
});

describe("ignore patterns", () => {
  it("drops matching lines, case-insensitive by default", () => {
    const text = "Starter $9\nLAST UPDATED March 3\nTrusted by 1,204 customers\nPro $29";
    assert.equal(
      applyIgnorePatterns(text, ["^last updated", "\\d[\\d,]* customers"]),
      "Starter $9\nPro $29"
    );
  });

  it("supports /re/flags and strips stateful g/y flags", () => {
    assert.equal(compileIgnorePattern("/^Beta$/").flags, "");
    assert.equal(compileIgnorePattern("/beta/gi").flags, "i");
    assert.equal(applyIgnorePatterns("Beta\nbeta", ["/^Beta$/"]), "beta");
    // non-global regex: repeated tests are stable
    assert.equal(applyIgnorePatterns("x1\nx2\nx3", ["/x\\d/g"]), "");
  });

  it("rejects invalid patterns and selectors at config time", () => {
    assert.throws(() => parseSourceFilter({ ignore: ["(unclosed"] }, "t"), /Invalid ignore pattern/);
    assert.throws(() => parseSourceFilter({ include: ["div[[["] }, "t"), /Invalid CSS selector/);
    assert.throws(() => parseSourceFilter({ exclude: [42] }, "t"), /list of strings/);
    assert.deepEqual(parseSourceFilter({ include: ".a", ignore: [] }, "t"), { include: [".a"] });
    assert.equal(parseSourceFilter({}, "t"), undefined);
  });

  it("filterKey is stable and empty when there is no filter", () => {
    assert.equal(filterKey(undefined), "");
    assert.equal(filterKey({ include: [] }), "");
    assert.equal(filterKey({ include: [".a"] }), filterKey({ include: [".a"] }));
    assert.notEqual(filterKey({ include: [".a"] }), filterKey({ include: [".b"] }));
  });
});

describe("config object form", () => {
  it("loads plain and object sources and round-trips filters through saveConfig", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-cfg-"));
    const p = path.join(dir, "competitors.yaml");
    fs.writeFileSync(
      p,
      `competitors:
  - id: acme
    name: Acme
    sources:
      website: "https://example.com"
      pricing:
        url: "https://example.com/pricing"
        include: [".pricing-table"]
        exclude: [".testimonials"]
        ignore: ["^Last updated", "\\\\d+ customers"]
`
    );
    const cfg = loadConfig(p);
    const acme = cfg.competitors[0]!;
    assert.equal(acme.sources.website, "https://example.com");
    assert.equal(acme.sources.pricing, "https://example.com/pricing");
    assert.deepEqual(acme.filters?.pricing, {
      include: [".pricing-table"],
      exclude: [".testimonials"],
      ignore: ["^Last updated", "\\d+ customers"],
    });
    assert.equal(acme.filters?.website, undefined);
    saveConfig(p, cfg);
    assert.deepEqual(loadConfig(p).competitors[0], acme);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("object form without url is an error", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-cfg-"));
    const p = path.join(dir, "c.yaml");
    fs.writeFileSync(p, `competitors:\n  - name: X\n    sources:\n      pricing: { include: [".a"] }\n`);
    assert.throws(() => loadConfig(p), /needs a 'url'/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("runCheck applies filters before diffing", () => {
  const realFetch = globalThis.fetch;
  const savedKey = process.env.OPENAI_API_KEY;
  let page = pricingPage();
  let dir = "";

  before(() => {
    delete process.env.OPENAI_API_KEY;
    globalThis.fetch = (async (url: string | URL) =>
      new Response(page, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })) as typeof fetch;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-data-"));
  });

  after(() => {
    globalThis.fetch = realFetch;
    if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const config = (filter?: Record<string, string[]>): AppConfig => ({
    fetchDelayMs: 0,
    competitors: [
      {
        id: "acme",
        name: "Acme",
        sources: { pricing: "https://example.com/pricing" },
        ...(filter ? { filters: { pricing: filter } } : {}),
      },
    ],
  });

  it("ignores churn outside include/ignore, reports real changes, re-baselines on filter change", async () => {
    const store = new Store(dir);
    const filter = { include: [".pricing-table", ".social"], ignore: ["customers$"] };

    let r = await runCheck(config(filter), store, { includeBaselinesInDigest: true });
    assert.equal(r.errors.length, 0);
    assert.equal(r.changes[0]?.isBaseline, true);

    // Testimonial + customer counter churn: filtered out → no change.
    page = pricingPage({ testimonial: "Changed my life — Bo", customers: "1,377" });
    r = await runCheck(config(filter), store);
    assert.equal(r.changes.length, 0);

    // Real price change inside the include selector → reported.
    page = pricingPage({ price: "$12/mo", testimonial: "Changed my life — Bo", customers: "1,377" });
    r = await runCheck(config(filter), store);
    assert.equal(r.changes.length, 1);
    assert.equal(r.changes[0]?.category, "pricing");

    // Editing the filter re-baselines instead of emitting a giant diff.
    r = await runCheck(config({ include: [".pricing-table"] }), store, {
      includeBaselinesInDigest: true,
    });
    assert.equal(r.changes.length, 1);
    assert.equal(r.changes[0]?.isBaseline, true);
    assert.match(r.changes[0]!.summary, /Filters changed/);

    // Selector drift is an error, and the snapshot is kept.
    r = await runCheck(config({ include: [".plans-v2"] }), store);
    assert.equal(r.changes.length, 0);
    assert.match(r.errors[0]?.error ?? "", /matched nothing/);
    assert.match(store.loadSnapshot("acme", "pricing")!.text, /\$12\/mo/);
  });
});
