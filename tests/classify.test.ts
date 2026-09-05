import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyChange, summarizeChangeLocally } from "../src/classify.ts";

describe("classifyChange", () => {
  it("uses pricing source as strong prior", () => {
    assert.equal(classifyChange("pricing", "Our plans are simple"), "pricing");
  });

  it("classifies changelog as feature by default", () => {
    assert.equal(
      classifyChange("changelog", "Released v2.1 with dark mode"),
      "feature"
    );
  });

  it("classifies blog source as blog", () => {
    assert.equal(
      classifyChange("blog", "Announcing our summer webinar series"),
      "blog"
    );
  });

  it("detects pricing signals on website", () => {
    assert.equal(
      classifyChange(
        "website",
        "New pricing: Starter now $19 per seat per month"
      ),
      "pricing"
    );
  });

  it("detects feature signals on website", () => {
    assert.equal(
      classifyChange(
        "website",
        "We launched a new API integration and generally available SSO"
      ),
      "feature"
    );
  });

  it("falls back to other when unclear", () => {
    assert.equal(classifyChange("website", "Hello world"), "other");
  });
});

describe("summarizeChangeLocally", () => {
  it("includes category and stats", () => {
    const s = summarizeChangeLocally(
      "feature",
      "changelog",
      3,
      1,
      "+ Added SSO\n- Removed beta flag"
    );
    assert.match(s, /Feature/);
    assert.match(s, /\+3\/-1/);
    assert.match(s, /SSO/);
  });
});
