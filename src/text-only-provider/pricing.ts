/**
 * Anthropic API pricing table for the models this feature is allowed to route to.
 * Source: Anthropic pricing documentation, checked 2026-08-20.
 * Claude Sonnet 5 carries an introductory rate that reverts to standard pricing on 2026-09-01.
 * Update this table (and the date above) whenever Anthropic publishes a rate change —
 * never call the network at runtime to fetch pricing.
 */

/**
 * Single source of truth for supported Anthropic model IDs used by this
 * feature. Every call site that needs a concrete Anthropic model ID
 * (registry profiles, roadmap-proposal routing, CLI validation, pricing)
 * must import these constants instead of repeating the literal string.
 */
export const ANTHROPIC_HAIKU_4_5_MODEL = "claude-haiku-4-5" as const;
export const ANTHROPIC_SONNET_5_MODEL = "claude-sonnet-5" as const;

export type AnthropicPricingModel =
  typeof ANTHROPIC_HAIKU_4_5_MODEL | typeof ANTHROPIC_SONNET_5_MODEL;

export type AnthropicPricingEntry = Readonly<{
  effectiveFrom: string; // ISO date (inclusive)
  effectiveTo?: string; // ISO date (exclusive); absent means still in effect
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
}>;

const ANTHROPIC_PRICING_TABLE: Readonly<
  Record<AnthropicPricingModel, readonly AnthropicPricingEntry[]>
> = Object.freeze({
  [ANTHROPIC_HAIKU_4_5_MODEL]: Object.freeze([
    Object.freeze({
      effectiveFrom: "1970-01-01",
      inputUsdPerMillionTokens: 1.0,
      outputUsdPerMillionTokens: 5.0,
    }),
  ]),
  [ANTHROPIC_SONNET_5_MODEL]: Object.freeze([
    Object.freeze({
      effectiveFrom: "1970-01-01",
      effectiveTo: "2026-09-01",
      inputUsdPerMillionTokens: 2.0,
      outputUsdPerMillionTokens: 10.0,
    }),
    Object.freeze({
      effectiveFrom: "2026-09-01",
      inputUsdPerMillionTokens: 3.0,
      outputUsdPerMillionTokens: 15.0,
    }),
  ]),
});

export function isAnthropicPricingModel(
  value: string,
): value is AnthropicPricingModel {
  return (
    value === ANTHROPIC_HAIKU_4_5_MODEL || value === ANTHROPIC_SONNET_5_MODEL
  );
}

/** Resolves the pricing entry in effect for a model at a given ISO date (defaults to now). */
export function resolveAnthropicPricing(
  model: string,
  atIsoDate: string = new Date().toISOString().slice(0, 10),
): AnthropicPricingEntry | null {
  if (!isAnthropicPricingModel(model)) return null;
  const entries = ANTHROPIC_PRICING_TABLE[model];
  const applicable = entries.find(
    (entry) =>
      atIsoDate >= entry.effectiveFrom &&
      (entry.effectiveTo === undefined || atIsoDate < entry.effectiveTo),
  );
  return applicable ?? null;
}

/** Pure cost calculation from a token count and a resolved pricing entry. Not a billed amount — a local estimate. */
export function calculateCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: AnthropicPricingEntry,
): number {
  return (
    (inputTokens * pricing.inputUsdPerMillionTokens) / 1_000_000 +
    (outputTokens * pricing.outputUsdPerMillionTokens) / 1_000_000
  );
}
