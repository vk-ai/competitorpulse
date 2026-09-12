import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { meaningfulDiff } from "../src/diff.ts";
import { verifySemanticChange } from "../src/verify.ts";

describe("verifySemanticChange", () => {
  it("keeps real pricing changes", () => {
    const before = "Starter $9/mo\nPro $29/mo\nFast sync\n";
    const after = "Starter $12/mo\nPro $29/mo\nFast sync\n";
    const diff = meaningfulDiff(before, after);
    const v = verifySemanticChange(before, after, diff);
    assert.equal(v.meaningful, true);
    assert.ok(v.signals.includes("price_change"));
    assert.match(v.interpretation, /pricing/i);
  });

  it("drops date-only footer churn", () => {
    const before = "Welcome to Acme\nLast updated Jan 1, 2025\nSecure by default\n";
    const after = "Welcome to Acme\nLast updated Mar 4, 2026\nSecure by default\n";
    const diff = meaningfulDiff(before, after);
    // First pass may still see a line change; second pass should neutralize dates
    const v = verifySemanticChange(before, after, {
      ...diff,
      changed: true,
      addedLines: Math.max(1, diff.addedLines),
      removedLines: Math.max(1, diff.removedLines),
    });
    assert.equal(v.meaningful, false);
    assert.equal(v.reason, "cosmetic_normalized_equal");
  });

  it("drops view-counter churn", () => {
    const before = "Launch post\n1,204 views\nBody stays the same\n";
    const after = "Launch post\n1,918 views\nBody stays the same\n";
    const diff = meaningfulDiff(before, after);
    const v = verifySemanticChange(before, after, {
      changed: true,
      unified: "x",
      excerpt: "- 1,204 views\n+ 1,918 views",
      addedLines: 1,
      removedLines: 1,
    });
    assert.equal(v.meaningful, false);
    assert.equal(v.reason, "cosmetic_normalized_equal");
  });

  it("drops pure sentence reorders", () => {
    const before = "Alpha ships weekly. Beta is stable. Gamma is experimental.\n";
    const after = "Beta is stable. Gamma is experimental. Alpha ships weekly.\n";
    const v = verifySemanticChange(before, after, {
      changed: true,
      unified: "x",
      excerpt: "reordered",
      addedLines: 1,
      removedLines: 1,
    });
    assert.equal(v.meaningful, false);
    assert.equal(v.reason, "reorder_only");
  });

  it("keeps feature launches", () => {
    const before = "Product overview\nFast sync\n";
    const after = "Product overview\nFast sync\nNew: AI summarization launched\n";
    const diff = meaningfulDiff(before, after);
    const v = verifySemanticChange(before, after, diff);
    assert.equal(v.meaningful, true);
    assert.ok(v.signals.includes("feature_mention"));
  });
});
