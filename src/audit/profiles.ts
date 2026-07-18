import type { AuditCategory, AuditProfile, AuditRule } from "./types.js";

export type AuditProfileDefinition = {
  readonly profile: AuditProfile;
  readonly categories: readonly AuditCategory[];
};

export const AUDIT_PROFILE_DEFINITIONS: Record<
  AuditProfile,
  AuditProfileDefinition
> = {
  quick: {
    profile: "quick",
    categories: ["architecture", "cli"],
  },
  strict: {
    profile: "strict",
    categories: ["json", "cli", "docs", "architecture"],
  },
  release: {
    profile: "release",
    categories: ["json", "cli", "docs", "architecture"],
  },
  docs: {
    profile: "docs",
    categories: ["docs"],
  },
  json: {
    profile: "json",
    categories: ["json"],
  },
  architecture: {
    profile: "architecture",
    categories: ["architecture"],
  },
};

export function isAuditProfile(value: string): value is AuditProfile {
  return value in AUDIT_PROFILE_DEFINITIONS;
}

export function getAuditProfileDefinition(
  profile: AuditProfile,
): AuditProfileDefinition {
  return AUDIT_PROFILE_DEFINITIONS[profile];
}

export function selectAuditRulesForProfile(
  profile: AuditProfile,
  rules: readonly AuditRule[],
): readonly AuditRule[] {
  const definition = getAuditProfileDefinition(profile);
  return rules.filter((rule) => definition.categories.includes(rule.category));
}
