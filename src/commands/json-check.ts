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
    const summaryStatus = summary.status;
    assertString(summaryStatus, "summary.status");
    assertOneOf(summaryStatus, "summary.status", AUDIT_SUMMARY_STATUSES);
    assertNumber(summary.total, "summary.total");
    assertNumber(summary.pass, "summary.pass");
    assertNumber(summary.warning, "summary.warning");
    assertNumber(summary.fail, "summary.fail");
    assertNumber(summary.skipped, "summary.skipped");
    assertNumber(summary.score, "summary.score");
    assertField(json, "findings");
    const findings = json.findings;
    assertArray(findings);
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
