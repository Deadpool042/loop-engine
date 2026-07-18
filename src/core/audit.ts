import { selectAuditRulesForProfile } from "../audit/profiles.js";
import {
  createAuditRuleManifest,
  selectAuditRules,
} from "../audit/registry.js";
import { AUDIT_RULES } from "../audit/rules.js";
import { runAudit as runAuditImplementation } from "../audit/runner.js";
import type { AuditReport } from "../audit/types.js";
import type { CoreAuditOptions } from "./types.js";

/**
 * Runs the deterministic audit through the stable Core boundary.
 * The CLI and future adapters must use this entry point rather than the
 * implementation module directly.
 */
export function runAudit(options: CoreAuditOptions = {}): AuditReport {
  return runAuditImplementation(options);
}

/** Generates the public audit report contract. */
export function generateAuditReport(
  options: CoreAuditOptions = {},
): AuditReport {
  return runAudit(options);
}

/** Generates the deterministic rule manifest for the selected audit scope. */
export function generateAuditRuleManifest(options: CoreAuditOptions = {}) {
  const profileRules =
    options.profile === undefined
      ? AUDIT_RULES
      : selectAuditRulesForProfile(options.profile, AUDIT_RULES);
  const rules = selectAuditRules(profileRules, options.selection);

  if (rules.length === 0) {
    throw new Error("No audit rules match the selected filters.");
  }

  return createAuditRuleManifest(rules);
}
