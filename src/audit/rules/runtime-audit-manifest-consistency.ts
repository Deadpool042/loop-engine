import { createAuditRuleManifest } from "../registry.js";
import type { AuditRuleManifest } from "../registry.js";
import { fail, pass } from "../findings.js";
import type { AuditRule } from "../types.js";

export type RuntimeAuditManifestConsistencyReport = Readonly<{
  missingIds: readonly string[];
  duplicateIds: readonly string[];
  unexpectedIds: readonly string[];
  orderMismatches: readonly string[];
  consistent: boolean;
}>;

/**
 * Pure invariant check: a manifest derived from a normalized rule inventory
 * must preserve that inventory exactly (same ids, each once, same order),
 * without independently reconstructing or filtering it.
 */
export function inspectRuntimeAuditManifestConsistency(
  rules: readonly AuditRule[],
  manifest: AuditRuleManifest,
): RuntimeAuditManifestConsistencyReport {
  const expectedIds = rules.map((rule) => rule.id);
  const actualIds = manifest.rules.map((entry) => entry.id);

  const expectedSet = new Set(expectedIds);
  const actualCounts = new Map<string, number>();
  for (const id of actualIds) {
    actualCounts.set(id, (actualCounts.get(id) ?? 0) + 1);
  }

  const missingIds = expectedIds.filter((id) => !actualCounts.has(id));
  const duplicateIds = [...actualCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  const unexpectedIds = [...new Set(actualIds)].filter(
    (id) => !expectedSet.has(id),
  );
  const orderMismatches =
    missingIds.length === 0 &&
    duplicateIds.length === 0 &&
    unexpectedIds.length === 0 &&
    actualIds.length === expectedIds.length &&
    actualIds.some((id, index) => id !== expectedIds[index])
      ? [`expected order [${expectedIds.join(", ")}] but got [${actualIds.join(", ")}]`]
      : [];

  return Object.freeze({
    missingIds: Object.freeze(missingIds),
    duplicateIds: Object.freeze(duplicateIds),
    unexpectedIds: Object.freeze(unexpectedIds),
    orderMismatches: Object.freeze(orderMismatches),
    consistent:
      missingIds.length === 0 &&
      duplicateIds.length === 0 &&
      unexpectedIds.length === 0 &&
      orderMismatches.length === 0,
  });
}

let registeredRuntimeAuditInventory: readonly AuditRule[] | null = null;

/**
 * Registers the normalized Runtime audit inventory this rule checks against.
 * Must be called with the composite AUDIT_RULES after createAuditRuleRegistry
 * normalizes it; kept as a late registration (rather than a static import of
 * ./runtime-rules.js) to avoid a circular module dependency, since that
 * module imports this rule to compose the inventory.
 */
export function registerRuntimeAuditManifestInventory(
  rules: readonly AuditRule[],
): void {
  registeredRuntimeAuditInventory = rules;
}

export const RUNTIME_AUDIT_MANIFEST_CONSISTENCY_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-425",
    category: "architecture",
    severity: "error",
    title: "Runtime audit manifest remains consistent with the normalized Runtime rule inventory",
    description:
      "A Runtime audit manifest derived from the normalized Runtime rule inventory must contain every rule exactly once, no unexpected rule, and preserve deterministic ordering, without reconstructing the inventory independently.",
    metadata: {
      introducedIn: "V13.84",
      tags: ["architecture", "contract", "self-audit", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-424"],
    },
    check: () => {
      const inventory = registeredRuntimeAuditInventory;

      if (inventory === null) {
        return fail(
          rule,
          "Runtime audit inventory is unavailable.",
          ["registered runtime audit inventory"],
          "Register the normalized Runtime audit inventory before evaluating manifest consistency.",
        );
      }

      const manifest = createAuditRuleManifest(inventory);
      const report = inspectRuntimeAuditManifestConsistency(inventory, manifest);

      if (!report.consistent) {
        const details = [
          ...report.missingIds.map((id) => `missing: ${id}`),
          ...report.duplicateIds.map((id) => `duplicate: ${id}`),
          ...report.unexpectedIds.map((id) => `unexpected: ${id}`),
          ...report.orderMismatches.map((mismatch) => `order: ${mismatch}`),
        ];

        return fail(
          rule,
          `${rule.title}.`,
          details,
          "Derive the Runtime audit manifest directly from the normalized AUDIT_RULES inventory, preserving every rule exactly once and its deterministic order.",
        );
      }

      return pass(
        rule,
        `${rule.title}.`,
        Object.freeze(manifest.rules.map((entry) => entry.id)),
      );
    },
  };

  return rule;
})();
