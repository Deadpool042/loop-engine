import type { AuditCategory, AuditProfile } from "./types.js";

export type AuditProfileDefinition = {
  readonly profile: AuditProfile;
  readonly categories: readonly AuditCategory[];
};

export const AUDIT_PROFILE_DEFINITIONS: Record<AuditProfile, AuditProfileDefinition> = {
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
