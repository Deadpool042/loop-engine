import { execFileSync } from "node:child_process";

const COMMANDS = [
  ["audit", "--json"],
  ["summary", "--json"],
  ["context", "loop-engine", "--json"],
  ["next", "loop-engine", "--json"],
  ["prompt", "loop-engine", "--json"],
  ["review", "loop-engine", "--json"],
  ["handoff", "loop-engine", "--json"],
  ["rag-search", "roadmap", "--json"],
] as const;

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected JSON object");
  }
}

function assertField(json: Record<string, unknown>, field: string): void {
  if (!(field in json)) {
    throw new Error(`missing field: ${field}`);
  }
}

function assertArray(value: unknown): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("expected JSON array");
  }
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be string`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number") {
    throw new Error(`${field} must be number`);
  }
}

function assertOneOf(value: string, field: string, values: readonly string[]): void {
  if (!values.includes(value)) {
    throw new Error(`${field} must be one of: ${values.join(", ")}`);
  }
}

const AUDIT_SUMMARY_STATUSES = ["pass", "warning", "fail"] as const;
const AUDIT_CATEGORIES = ["json", "cli", "docs", "architecture"] as const;
const AUDIT_SEVERITIES = ["error", "warning"] as const;
const AUDIT_FINDING_STATUSES = ["pass", "fail", "skipped"] as const;
const AUDIT_PRIORITIES = ["low", "medium", "high"] as const;

function validatePayload(command: readonly string[], json: unknown): void {
  assertRecord(json);
  assertField(json, "schemaVersion");

  if (json.schemaVersion !== 1) {
    throw new Error("schemaVersion != 1");
  }

  const commandName = command[0];

  if (commandName === "audit") {
    assertField(json, "generatedAt");
    assertString(json.generatedAt, "generatedAt");
    if (Number.isNaN(Date.parse(json.generatedAt))) {
      throw new Error("generatedAt must be parseable date");
    }
    assertField(json, "summary");
    const summary = json.summary;
    assertRecord(summary);
    assertField(summary, "status");
    assertField(summary, "total");
    assertField(summary, "pass");
    assertField(summary, "warning");
    assertField(summary, "fail");
    assertField(summary, "skipped");
    assertField(summary, "score");
    assertField(summary, "byCategory");
    assertField(summary, "byPriority");
    assertField(summary, "recommendationsByPriority");
    const summaryStatus = summary.status;
    assertString(summaryStatus, "summary.status");
    assertOneOf(summaryStatus, "summary.status", AUDIT_SUMMARY_STATUSES);
    assertNumber(summary.total, "summary.total");
    assertNumber(summary.pass, "summary.pass");
    assertNumber(summary.warning, "summary.warning");
    assertNumber(summary.fail, "summary.fail");
    assertNumber(summary.skipped, "summary.skipped");
    assertNumber(summary.score, "summary.score");

    const byCategory = summary.byCategory;
    assertRecord(byCategory);
    for (const category of AUDIT_CATEGORIES) {
      if (category in byCategory) {
        assertNumber(byCategory[category], `summary.byCategory.${category}`);
      }
    }

    const byPriority = summary.byPriority;
    assertRecord(byPriority);
    for (const priority of AUDIT_PRIORITIES) {
      if (priority in byPriority) {
        assertNumber(byPriority[priority], `summary.byPriority.${priority}`);
      }
    }

    const recommendationsByPriority = summary.recommendationsByPriority;
    assertRecord(recommendationsByPriority);
    for (const priority of AUDIT_PRIORITIES) {
      if (priority in recommendationsByPriority) {
        assertNumber(recommendationsByPriority[priority], `summary.recommendationsByPriority.${priority}`);
      }
    }
    assertField(json, "findings");
    const findings = json.findings;
    assertArray(findings);
    const findingRuleIds = new Set<string>();
    const findingsByRuleId = new Map<string, Record<string, unknown>>();
    for (const findingValue of findings) {
      assertRecord(findingValue);
      assertString(findingValue.ruleId, "finding.ruleId");
      if (findingRuleIds.has(findingValue.ruleId)) {
        throw new Error(`finding.ruleId must be unique: ${findingValue.ruleId}`);
      }
      findingRuleIds.add(findingValue.ruleId);
      findingsByRuleId.set(findingValue.ruleId, findingValue);
      assertString(findingValue.message, "finding.message");

      const findingCategoryValue = findingValue.category;
      assertString(findingCategoryValue, "finding.category");
      assertOneOf(findingCategoryValue, "finding.category", AUDIT_CATEGORIES);

      const findingSeverityValue = findingValue.severity;
      assertString(findingSeverityValue, "finding.severity");
      assertOneOf(findingSeverityValue, "finding.severity", AUDIT_SEVERITIES);

      const findingStatusValue = findingValue.status;
      assertString(findingStatusValue, "finding.status");
      assertOneOf(findingStatusValue, "finding.status", AUDIT_FINDING_STATUSES);

      const findingPriorityValue = findingValue.priority;
      assertString(findingPriorityValue, "finding.priority");
      assertOneOf(findingPriorityValue, "finding.priority", AUDIT_PRIORITIES);
    }
    const summaryCountTotal = summary.pass + summary.warning + summary.fail + summary.skipped;
    if (summary.total !== findings.length) {
      throw new Error("summary.total must match findings length");
    }
    if (summary.total !== summaryCountTotal) {
      throw new Error("summary.total must match summary count total");
    }

    const expectedScore = summary.total === 0 ? 100 : Math.round((summary.pass / summary.total) * 100);
    if (summary.score !== expectedScore) {
      throw new Error("summary.score must match pass ratio");
    }

    const expectedStatus = summary.fail > 0 ? "fail" : summary.warning > 0 ? "warning" : "pass";
    if (summaryStatus !== expectedStatus) {
      throw new Error("summary.status must match finding counts");
    }

    const categoryCounts: Record<string, number> = {};
    for (const finding of findings) {
      assertRecord(finding);
      const category = finding.category;
      assertString(category, "finding.category");
      assertOneOf(category, "finding.category", AUDIT_CATEGORIES);
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    }

    for (const category of AUDIT_CATEGORIES) {
      const actualCategoryCount = category in byCategory ? byCategory[category] : 0;
      assertNumber(actualCategoryCount, `summary.byCategory.${category}`);
      const expectedCategoryCount = categoryCounts[category] ?? 0;

      if (actualCategoryCount !== expectedCategoryCount) {
        throw new Error(`summary.byCategory.${category} must match finding category count`);
      }
    }

    const priorityCounts: Record<string, number> = {};
    for (const finding of findings) {
      assertRecord(finding);
      const priority = finding.priority;
      assertString(priority, "finding.priority");
      assertOneOf(priority, "finding.priority", AUDIT_PRIORITIES);
      priorityCounts[priority] = (priorityCounts[priority] ?? 0) + 1;
    }

    for (const priority of AUDIT_PRIORITIES) {
      const actualPriorityCount = priority in byPriority ? byPriority[priority] : 0;
      assertNumber(actualPriorityCount, `summary.byPriority.${priority}`);
      const expectedPriorityCount = priorityCounts[priority] ?? 0;

      if (actualPriorityCount !== expectedPriorityCount) {
        throw new Error(`summary.byPriority.${priority} must match finding priority count`);
      }
    }
    if (findings.length > 0) {
      const finding = findings[0];
      assertRecord(finding);
      assertField(finding, "ruleId");
      assertField(finding, "category");
      assertField(finding, "severity");
      assertField(finding, "status");
      assertField(finding, "priority");
      assertField(finding, "message");
      assertString(finding.ruleId, "finding.ruleId");
      assertString(finding.message, "finding.message");

      const findingCategory = finding.category;
      assertString(findingCategory, "finding.category");
      assertOneOf(findingCategory, "finding.category", AUDIT_CATEGORIES);

      const findingSeverity = finding.severity;
      assertString(findingSeverity, "finding.severity");
      assertOneOf(findingSeverity, "finding.severity", AUDIT_SEVERITIES);

      const findingStatus = finding.status;
      assertString(findingStatus, "finding.status");
      assertOneOf(findingStatus, "finding.status", AUDIT_FINDING_STATUSES);

      const findingPriority = finding.priority;
      assertString(findingPriority, "finding.priority");
      assertOneOf(findingPriority, "finding.priority", AUDIT_PRIORITIES);
    }
    assertField(json, "recommendations");
    const recommendations = json.recommendations;
    assertArray(recommendations);
    const recommendationRuleIds = new Set<string>();
    for (const recommendationValue of recommendations) {
      assertRecord(recommendationValue);
      assertString(recommendationValue.ruleId, "recommendation.ruleId");
      if (!findingRuleIds.has(recommendationValue.ruleId)) {
        throw new Error(`recommendation.ruleId must reference an existing finding.ruleId: ${recommendationValue.ruleId}`);
      }
      const referencedFinding = findingsByRuleId.get(recommendationValue.ruleId);
      if (referencedFinding?.status === "pass") {
        throw new Error(`recommendation.ruleId must reference an actionable finding.ruleId: ${recommendationValue.ruleId}`);
      }
      if (recommendationRuleIds.has(recommendationValue.ruleId)) {
        throw new Error(`recommendation.ruleId must be unique: ${recommendationValue.ruleId}`);
      }
      recommendationRuleIds.add(recommendationValue.ruleId);
      assertString(recommendationValue.message, "recommendation.message");

      const recommendationPriorityValue = recommendationValue.priority;
      assertString(recommendationPriorityValue, "recommendation.priority");
      assertOneOf(recommendationPriorityValue, "recommendation.priority", AUDIT_PRIORITIES);
    }
    if (recommendations.length > 0) {
      const recommendation = recommendations[0];
      assertRecord(recommendation);
      assertField(recommendation, "ruleId");
      assertField(recommendation, "priority");
      assertField(recommendation, "message");
      assertString(recommendation.ruleId, "recommendation.ruleId");
      assertString(recommendation.message, "recommendation.message");

      const recommendationPriority = recommendation.priority;
      assertString(recommendationPriority, "recommendation.priority");
      assertOneOf(recommendationPriority, "recommendation.priority", AUDIT_PRIORITIES);
    }

    const recommendationPriorityCounts: Record<string, number> = {};
    for (const recommendationValue of recommendations) {
      assertRecord(recommendationValue);
      const priority = recommendationValue.priority;
      assertString(priority, "recommendation.priority");
      assertOneOf(priority, "recommendation.priority", AUDIT_PRIORITIES);
      recommendationPriorityCounts[priority] = (recommendationPriorityCounts[priority] ?? 0) + 1;
    }

    for (const priority of AUDIT_PRIORITIES) {
      const actualRecommendationPriorityCount =
        priority in recommendationsByPriority ? recommendationsByPriority[priority] : 0;
      assertNumber(actualRecommendationPriorityCount, `summary.recommendationsByPriority.${priority}`);
      const expectedRecommendationPriorityCount = recommendationPriorityCounts[priority] ?? 0;

      if (actualRecommendationPriorityCount !== expectedRecommendationPriorityCount) {
        throw new Error(`summary.recommendationsByPriority.${priority} must match recommendation priority count`);
      }
    }
  } else if (commandName === "summary") {
    assertField(json, "projects");
  } else if (commandName === "context") {
    assertField(json, "project");
    assertField(json, "docs");
  } else if (commandName === "next") {
    assertField(json, "project");
    assertField(json, "roadmap");
  } else if (commandName === "prompt") {
    assertField(json, "project");
    assertField(json, "instructions");
  } else if (commandName === "review") {
    assertField(json, "project");
    assertField(json, "diffStat");
  } else if (commandName === "handoff") {
    assertField(json, "project");
    assertField(json, "instructions");
  } else if (commandName === "rag-search") {
    assertField(json, "query");
    assertField(json, "results");
  }
}

export function runJsonCheck(): void {
  execFileSync("pnpm", ["run", "rag-index"], { encoding: "utf8" });

  let failures = 0;

  for (const command of COMMANDS) {
    try {
      const output = execFileSync(
        "pnpm",
        ["exec", "tsx", "src/cli.ts", ...command],
        { encoding: "utf8" },
      );

      const json = JSON.parse(output) as unknown;

      validatePayload(command, json);

      console.log("✓", command.join(" "));
    } catch (error) {
      failures++;
      console.error("✗", command.join(" "));
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}
