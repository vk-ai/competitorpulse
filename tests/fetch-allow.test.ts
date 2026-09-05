import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertAllowedUrl, normalizeText } from "../src/fetch.ts";

describe("assertAllowedUrl", () => {
  it("allows https sites", () => {
    assert.doesNotThrow(() => assertAllowedUrl("https://example.com/pricing"));
  });

  it("blocks LinkedIn", () => {
    assert.throws(
      () => assertAllowedUrl("https://www.linkedin.com/company/acme"),
      /LinkedIn/
    );
  });

  it("blocks non-http schemes", () => {
    assert.throws(() => assertAllowedUrl("file:///etc/passwd"), /http/);
  });
});

describe("normalizeText", () => {
  it("collapses whitespace", () => {
    assert.equal(normalizeText("a  \n\n\nb"), "a\n\nb");
  });
});
