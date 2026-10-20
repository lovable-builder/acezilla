import { test } from "node:test";
import assert from "node:assert/strict";
import { safeRedirectPath } from "./redirect";

test("keeps normal same-site paths", () => {
  assert.equal(safeRedirectPath("/reset-password"), "/reset-password");
  assert.equal(safeRedirectPath("/connections?notice=hi"), "/connections?notice=hi");
});

test("falls back for empty or missing values", () => {
  assert.equal(safeRedirectPath(null), "/dashboard");
  assert.equal(safeRedirectPath(""), "/dashboard");
  assert.equal(safeRedirectPath("dashboard"), "/dashboard");
});

test("rejects anything that could leave the site", () => {
  for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "///evil.com", "javascript:alert(1)", "/\u0000x", "/%2F%2Fevil.com/../../.."]) {
    const out = safeRedirectPath(bad);
    assert.ok(out.startsWith("/") && !out.startsWith("//"), `${JSON.stringify(bad)} -> ${out}`);
    assert.ok(!out.includes("evil.com") || out.startsWith("/%2F"), `${bad} -> ${out}`);
  }
  assert.equal(safeRedirectPath("//evil.com"), "/dashboard");
  assert.equal(safeRedirectPath("https://evil.com"), "/dashboard");
  assert.equal(safeRedirectPath("/\\evil.com"), "/dashboard");
});

test("custom fallback is honoured", () => {
  assert.equal(safeRedirectPath("//x", "/login"), "/login");
});
