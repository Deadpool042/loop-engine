import {
  AUDIT_RULE_STABILITIES,
  AUDIT_RULE_TAGS,
  type AuditCategory,
  type AuditRule,
  type AuditRuleDefinition,
  type AuditRuleMetadata,
  type AuditRuleStability,
  type AuditRuleTag,
} from "./types.js";

const DEFAULT_TAGS_BY_CATEGORY: Readonly<
  Record<AuditCategory, readonly AuditRuleTag[]>
> = {
  architecture: ["architecture"],
  duplication: ["architecture"],
  json: ["json"],
  cli: ["cli"],
  tests: ["contract"],
  docs: ["documentation"],
  rag: ["contract"],
  handoff: ["contract"],
};

export type AuditRuleSelection = Readonly<{
  ruleIds?: readonly string[];
  tags?: readonly AuditRuleTag[];
  stabilities?: readonly AuditRuleStability[];
}>;

export type AuditRuleManifestEntry = Readonly<{
  id: string;
  category: AuditRule["category"];
  severity: AuditRule["severity"];
  title: string;
  description: string;
  introducedIn: string | null;
  tags: readonly AuditRuleTag[];
  stability: AuditRuleStability;
  dependsOn: readonly string[];
}>;

export type AuditRuleManifest = Readonly<{
  schemaVersion: 1;
  rules: readonly AuditRuleManifestEntry[];
}>;

export function isAuditRuleTag(value: string): value is AuditRuleTag {
  return (AUDIT_RULE_TAGS as readonly string[]).includes(value);
}

export function isAuditRuleStability(
  value: string,
): value is AuditRuleStability {
  return (AUDIT_RULE_STABILITIES as readonly string[]).includes(value);
}

function normalizeMetadata(rule: AuditRuleDefinition): AuditRuleMetadata {
  const metadata = rule.metadata ?? {};
  const tags = metadata.tags ?? DEFAULT_TAGS_BY_CATEGORY[rule.category];
  const stability = metadata.stability ?? "stable";
  const dependsOn = metadata.dependsOn ?? [];

  if (metadata.introducedIn !== undefined && typeof metadata.introducedIn !== "string" && metadata.introducedIn !== null) {
    throw new Error(`Invalid introducedIn metadata for audit rule: ${rule.id}`);
  }
  if (!isAuditRuleStability(stability)) {
    throw new Error(`Invalid stability metadata for audit rule: ${rule.id}`);
  }
  if (tags.length === 0 || tags.some((tag) => !isAuditRuleTag(tag))) {
    throw new Error(`Invalid tags metadata for audit rule: ${rule.id}`);
  }
  if (dependsOn.some((dependency) => dependency.length === 0)) {
    throw new Error(`Invalid dependency metadata for audit rule: ${rule.id}`);
  }

  return Object.freeze({
    introducedIn: metadata.introducedIn ?? null,
    tags: Object.freeze([...new Set(tags)]),
    stability,
    dependsOn: Object.freeze([...new Set(dependsOn)]),
  });
}

export function createAuditRuleRegistry(
  definitions: readonly AuditRuleDefinition[],
): readonly AuditRule[] {
  const ids = new Set<string>();
  const rules = definitions.map((definition) => {
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate audit rule id: ${definition.id}`);
    }
    ids.add(definition.id);

    return Object.freeze({
      ...definition,
      metadata: normalizeMetadata(definition),
    });
  });

  for (const rule of rules) {
    for (const dependency of rule.metadata.dependsOn) {
      if (dependency === rule.id) {
        throw new Error(`Audit rule must not depend on itself: ${rule.id}`);
      }
      if (!ids.has(dependency)) {
        throw new Error(
          `Audit rule dependency does not exist: ${rule.id} -> ${dependency}`,
        );
      }
    }
  }

  return Object.freeze(rules);
}

export function selectAuditRules(
  rules: readonly AuditRule[],
  selection: AuditRuleSelection = {},
): readonly AuditRule[] {
  return rules.filter((rule) => {
    const matchesIds =
      selection.ruleIds === undefined || selection.ruleIds.includes(rule.id);
    const matchesTags =
      selection.tags === undefined ||
      selection.tags.some((tag) => rule.metadata.tags.includes(tag));
    const matchesStability =
      selection.stabilities === undefined ||
      selection.stabilities.includes(rule.metadata.stability);

    return matchesIds && matchesTags && matchesStability;
  });
}

export function createAuditRuleManifest(
  rules: readonly AuditRule[],
): AuditRuleManifest {
  return Object.freeze({
    schemaVersion: 1,
    rules: Object.freeze(
      rules.map((rule) =>
        Object.freeze({
          id: rule.id,
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          description: rule.description,
          introducedIn: rule.metadata.introducedIn,
          tags: rule.metadata.tags,
          stability: rule.metadata.stability,
          dependsOn: rule.metadata.dependsOn,
        }),
      ),
    ),
  });
}
