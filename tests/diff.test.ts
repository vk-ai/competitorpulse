import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contentHash, meaningfulDiff } from "../src/diff.ts";

describe("contentHash", () => {
  it("is stable for identical input", () => {
    assert.equal(contentHash("hello"), contentHash("hello"));
  });
  it("differs for different input", () => {
    assert.notEqual(contentHash("hello"), contentHash("world"));
  });
});

describe("meaningfulDiff", () => {
  it("reports unchanged for identical text", () => {
    const r = meaningfulDiff("a\nb\n", "a\nb\n");
    assert.equal(r.changed, false);
    assert.equal(r.addedLines, 0);
  });

  it("detects added feature lines", () => {
    const before = "Product overview\nFast sync\nSecure by default\n";
    const after =
      "Product overview\nFast sync\nNew: AI summarization\nSecure by default\n";
    const r = meaningfulDiff(before, after);
    assert.equal(r.changed, true);
    assert.ok(r.addedLines >= 1);
    assert.match(r.excerpt, /\+ .*AI summarization/);
  });

  it("detects pricing changes", () => {
    const before = "Starter $9/mo\nPro $29/mo\n";
    const after = "Starter $12/mo\nPro $29/mo\n";
    const r = meaningfulDiff(before, after);
    assert.equal(r.changed, true);
    assert.ok(r.removedLines >= 1);
    assert.ok(r.addedLines >= 1);
  });

  it("ignores pure boilerplate cookie banner churn", () => {
    const before = "Welcome to Acme\nCookie policy updated\n";
    const after = "Welcome to Acme\nCookie consent required\n";
    // Both sides have cookie-ish lines filtered; remaining "Welcome" identical
    // If only noise lines change, meaningfulDiff should report unchanged.
    const noiseOnlyBefore = "Cookie policy updated\nPrivacy notice\n";
    const noiseOnlyAfter = "Cookie consent required\nPrivacy notice\n";
    const r = meaningfulDiff(noiseOnlyBefore, noiseOnlyAfter);
    assert.equal(r.changed, false);
  });
});
