import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCostUsd,
  resolveAnthropicPricing,
} from "../../src/text-only-provider/pricing.js";

test("resolves Haiku 4.5 pricing regardless of date", () => {
  const pricing = resolveAnthropicPricing("claude-haiku-4-5", "2026-08-20");
  assert.deepEqual(pricing, {
    effectiveFrom: "1970-01-01",
    inputUsdPerMillionTokens: 1.0,
    outputUsdPerMillionTokens: 5.0,
  });
});

test("resolves Sonnet 5 introductory pricing before the 2026-09-01 change", () => {
  const pricing = resolveAnthropicPricing("claude-sonnet-5", "2026-08-31");
  assert.equal(pricing?.inputUsdPerMillionTokens, 2.0);
  assert.equal(pricing?.outputUsdPerMillionTokens, 10.0);
});

test("resolves Sonnet 5 standard pricing on and after the 2026-09-01 change", () => {
  const onChangeDay = resolveAnthropicPricing("claude-sonnet-5", "2026-09-01");
  const afterChangeDay = resolveAnthropicPricing(
    "claude-sonnet-5",
    "2026-12-01",
  );
  assert.equal(onChangeDay?.inputUsdPerMillionTokens, 3.0);
  assert.equal(onChangeDay?.outputUsdPerMillionTokens, 15.0);
  assert.equal(afterChangeDay?.inputUsdPerMillionTokens, 3.0);
  assert.equal(afterChangeDay?.outputUsdPerMillionTokens, 15.0);
});

test("returns null for a model outside the supported pricing table", () => {
  assert.equal(resolveAnthropicPricing("claude-opus-5", "2026-08-20"), null);
});

test("computes a deterministic cost from token counts and a pricing entry", () => {
  const cost = calculateCostUsd(2_000, 500, {
    effectiveFrom: "1970-01-01",
    inputUsdPerMillionTokens: 1.0,
    outputUsdPerMillionTokens: 5.0,
  });
  assert.equal(cost, (2_000 * 1.0) / 1_000_000 + (500 * 5.0) / 1_000_000);
});
