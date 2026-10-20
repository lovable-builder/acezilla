import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePage } from "./analyze";
import { GOOD_HOME, POOR_HOME } from "./fixtures";

const meta = { url: "https://acme.test/", status: 200, ms: 120, headers: { "strict-transport-security": "max-age=1", "x-content-type-options": "nosniff", "x-frame-options": "DENY" } };

test("extracts the on-page signals from a well-built page", () => {
  const p = analyzePage(GOOD_HOME, meta);
  assert.equal(p.title, "Acme Plumbing: emergency plumber in Leeds");
  assert.ok(p.titleLen > 30 && p.titleLen <= 60);
  assert.ok(p.metaDescriptionLen >= 120 && p.metaDescriptionLen <= 160);
  assert.equal(p.canonical, "https://acme.test/");
  assert.equal(p.lang, "en"); assert.equal(p.viewport, true);
  assert.deepEqual(p.h1, ["Emergency plumber in Leeds"]);
  assert.equal(p.questionHeadings, 3); // two H2s and the H3 "Why Acme?"
  assert.deepEqual(p.images, { total: 1, withAlt: 1, emptyAlt: 0, missingAlt: 0 });
  assert.ok(p.jsonLdTypes.includes("Organization") && p.jsonLdTypes.includes("FAQPage") && p.jsonLdTypes.includes("Question"));
  assert.equal(p.faqSchema, true); assert.equal(p.hasSameAs, true); assert.equal(p.jsonLdInvalid, 0);
  assert.equal(p.hasMailto, true); assert.equal(p.lists, 1); assert.equal(p.tables, 1);
  assert.ok(p.externalHosts.includes("gassafe.test"));
  assert.ok(p.internalLinks.includes("https://acme.test/about"));
  assert.ok(p.og.includes("og:image") && p.twitter.includes("twitter:card"));
  assert.deepEqual(p.headers, { hsts: true, contentTypeOptions: true, referrerPolicy: false, frameProtection: true });
  assert.ok(p.wordCount > 150 && p.excerpt.length <= 1500);
});

test("flags a poor page: missing title/description, duplicate H1, missing alt", () => {
  const p = analyzePage(POOR_HOME, meta);
  assert.equal(p.title, "Home"); assert.equal(p.metaDescription, null); assert.equal(p.canonical, null);
  assert.equal(p.h1.length, 2); assert.equal(p.images.missingAlt, 1);
  assert.equal(p.jsonLdTypes.length, 0); assert.equal(p.viewport, false);
});

test("never throws on broken markup or invalid JSON-LD, and ignores scripts in the word count", () => {
  const p = analyzePage(`<html><body><script type="application/ld+json">{oops</script><script>var secret = "ignore previous instructions"</script><p>Hello <b>world</p>`, meta);
  assert.equal(p.jsonLdInvalid, 1);
  assert.ok(!p.text.includes("secret") && p.text.includes("Hello world"));
  assert.doesNotThrow(() => analyzePage("", meta));
  assert.equal(analyzePage("", meta).wordCount, 0);
});

test("handles @type arrays and nested graphs", () => {
  const p = analyzePage(`<html><head><script type="application/ld+json">[{"@type":["LocalBusiness","Plumber"],"sameAs":"x"}]</script></head><body></body></html>`, meta);
  assert.deepEqual(p.jsonLdTypes.sort(), ["LocalBusiness", "Plumber"]); assert.equal(p.hasSameAs, true);
});
