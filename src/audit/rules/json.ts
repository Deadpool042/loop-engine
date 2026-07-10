import { existsSync, readFileSync } from "node:fs";
import { fail, pass } from "../findings.js";
import { PUBLIC_COMMANDS, PUBLIC_JSON_COMMAND_FILES } from "../public-commands.js";
import type { AuditRule } from "../types.js";

export const JSON_SCHEMA_VERSION_RULE: AuditRule = {
  id: "JSON-001",
  category: "json",
  severity: "error",
  title: "Public JSON outputs expose schemaVersion",
  description: "Every documented public JSON command should expose schemaVersion.",
  check: () => {
    const files = PUBLIC_JSON_COMMAND_FILES;

    const missing = files.filter((file) => {
      if (!existsSync(file)) {
        return true;
      }

      return !readFileSync(file, "utf8").includes("schemaVersion");
    });

    if (missing.length > 0) {
      return fail(
        JSON_SCHEMA_VERSION_RULE,
        "Some public JSON commands do not expose schemaVersion.",
        missing,
        "Add schemaVersion to every public command that supports --json.",
      );
    }

    return pass(
      JSON_SCHEMA_VERSION_RULE,
      "All public JSON command files expose schemaVersion.",
      files,
    );
  },
};

export const JSON_CHECK_COVERAGE_RULE: AuditRule = {
  id: "JSON-005",
  category: "json",
  severity: "warning",
  title: "Public JSON commands are covered by json-check",
  description: "Every public command exposing --json should be listed in json-check.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_CHECK_COVERAGE_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts or update the audit rule if the command was intentionally removed.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedCommands = PUBLIC_COMMANDS;

    const missing = expectedCommands.filter(
      (command) => !content.includes(`["${command}"`),
    );

    if (missing.length > 0) {
      return fail(
        JSON_CHECK_COVERAGE_RULE,
        "Some public JSON commands are missing from json-check.",
        missing,
        "Add the missing public JSON commands to src/commands/json-check.ts.",
      );
    }

    return pass(
      JSON_CHECK_COVERAGE_RULE,
      "All public JSON commands are covered by json-check.",
      expectedCommands,
    );
  },
};

export const AUDIT_JSON_SUMMARY_CONTRACT_RULE: AuditRule = {
  id: "JSON-006",
  category: "json",
  severity: "warning",
  title: "Audit JSON report exposes stable fields",
  description: "The audit JSON report should expose the stable fields used by downstream tools.",
  check: () => {
    const typesPath = "src/audit/types.ts";

    if (!existsSync(typesPath)) {
      return fail(
        AUDIT_JSON_SUMMARY_CONTRACT_RULE,
        "Audit report type definition is missing.",
        [typesPath],
        "Restore src/audit/types.ts or update the audit rule if the report model moved.",
      );
    }

    const content = readFileSync(typesPath, "utf8");

    const expectedTokens = [
      "status: AuditSummaryStatus;",
      "total: number;",
      "pass: number;",
      "warning: number;",
      "fail: number;",
      "skipped: number;",
      "score: number;",
      "byCategory: Partial<Record<AuditCategory, number>>;",
      "byPriority: Partial<Record<AuditPriority, number>>;",
      "recommendations: readonly AuditRecommendation[];",
    ];

    const missing = expectedTokens.filter(
      (token) => !content.includes(token),
    );

    if (missing.length > 0) {
      return fail(
        AUDIT_JSON_SUMMARY_CONTRACT_RULE,
        "Audit JSON report contract is incomplete.",
        missing,
        "Ensure AuditReport exposes all stable report fields.",
      );
    }

    return pass(
      AUDIT_JSON_SUMMARY_CONTRACT_RULE,
      "Audit JSON report contract exposes all stable fields.",
      expectedTokens,
    );
  },
};

export const JSON_CHECK_PARSE_ASSERTION_RULE: AuditRule = {
  id: "JSON-007",
  category: "json",
  severity: "warning",
  title: "json-check parses public JSON outputs",
  description: "json-check should assert that public JSON command outputs are valid JSON.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_CHECK_PARSE_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so public JSON output parsing can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "JSON.parse(output)",
      "validatePayload(command, json)",
      "assertField(json, \"schemaVersion\")",
      "execFileSync",
      "process.exitCode = 1",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_CHECK_PARSE_ASSERTION_RULE,
        "json-check does not clearly assert JSON parsability for public outputs.",
        missing,
        "Ensure json-check parses every public JSON command output and fails on invalid payloads.",
      );
    }

    return pass(
      JSON_CHECK_PARSE_ASSERTION_RULE,
      "json-check asserts public JSON output parsability.",
      expectedTokens,
    );
  },
};

export const JSON_ROOT_SCHEMA_VERSION_ASSERTION_RULE: AuditRule = {
  id: "JSON-008",
  category: "json",
  severity: "warning",
  title: "Public JSON outputs assert root schemaVersion",
  description: "json-check should verify that public JSON outputs are root objects with schemaVersion 1.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_ROOT_SCHEMA_VERSION_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so root JSON schemaVersion assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "assertRecord(json)",
      "assertField(json, \"schemaVersion\")",
      "json.schemaVersion !== 1",
      "schemaVersion != 1",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_ROOT_SCHEMA_VERSION_ASSERTION_RULE,
        "json-check does not assert the root JSON schemaVersion contract.",
        missing,
        "Ensure json-check validates that every public JSON output is an object with schemaVersion 1.",
      );
    }

    return pass(
      JSON_ROOT_SCHEMA_VERSION_ASSERTION_RULE,
      "json-check asserts the root JSON schemaVersion contract.",
      expectedTokens,
    );
  },
};

export const JSON_GENERATED_AT_CONTRACT_RULE: AuditRule = {
  id: "JSON-009",
  category: "json",
  severity: "warning",
  title: "Audit JSON report exposes generatedAt timestamp",
  description: "The audit JSON report should expose a generatedAt ISO timestamp for downstream traceability.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "generatedAt: string;",
      },
      {
        file: "src/audit/runner.ts",
        token: "generatedAt: new Date().toISOString()",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        JSON_GENERATED_AT_CONTRACT_RULE,
        "Audit JSON report generatedAt timestamp contract is incomplete.",
        missing,
        "Ensure AuditReport exposes generatedAt and runAudit populates it with an ISO timestamp.",
      );
    }

    return pass(
      JSON_GENERATED_AT_CONTRACT_RULE,
      "Audit JSON report exposes generatedAt timestamp.",
      expectations.map(({ file }) => file),
    );
  },
};

export const JSON_RECOMMENDATIONS_CONTRACT_RULE: AuditRule = {
  id: "JSON-010",
  category: "json",
  severity: "warning",
  title: "Audit JSON report exposes recommendations array",
  description: "The audit JSON report should expose top-level recommendations for downstream reporting.",
  check: () => {
    const expectations = [
      {
        file: "src/audit/types.ts",
        token: "recommendations: readonly AuditRecommendation[];",
      },
      {
        file: "src/audit/runner.ts",
        token: "const recommendations = findings",
      },
      {
        file: "src/audit/runner.ts",
        token: "recommendations,",
      },
    ];

    const missing = expectations
      .filter(({ file, token }) => !existsSync(file) || !readFileSync(file, "utf8").includes(token))
      .map(({ file, token }) => `${file} -> ${token}`);

    if (missing.length > 0) {
      return fail(
        JSON_RECOMMENDATIONS_CONTRACT_RULE,
        "Audit JSON report recommendations contract is incomplete.",
        missing,
        "Ensure AuditReport exposes recommendations and runAudit computes and returns them.",
      );
    }

    return pass(
      JSON_RECOMMENDATIONS_CONTRACT_RULE,
      "Audit JSON report exposes recommendations array.",
      expectations.map(({ file }) => file),
    );
  },
};

export const JSON_AUDIT_REPORT_FIELD_ASSERTION_RULE: AuditRule = {
  id: "JSON-011",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit report stable fields",
  description: "json-check should assert the stable top-level audit JSON report fields.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_REPORT_FIELD_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit JSON report field assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "commandName === \"audit\"",
      "assertField(json, \"generatedAt\")",
      "assertField(json, \"summary\")",
      "assertField(json, \"findings\")",
      "assertField(json, \"recommendations\")",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_REPORT_FIELD_ASSERTION_RULE,
        "json-check does not assert all stable audit report fields.",
        missing,
        "Ensure json-check validates generatedAt, summary, findings, and recommendations for audit --json.",
      );
    }

    return pass(
      JSON_AUDIT_REPORT_FIELD_ASSERTION_RULE,
      "json-check asserts audit report stable fields.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_FIELD_ASSERTION_RULE: AuditRule = {
  id: "JSON-012",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary stable fields",
  description: "json-check should assert the stable audit summary fields.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_FIELD_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit summary field assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const summary = json.summary",
      "assertRecord(summary)",
      "assertField(summary, \"status\")",
      "assertField(summary, \"total\")",
      "assertField(summary, \"pass\")",
      "assertField(summary, \"warning\")",
      "assertField(summary, \"fail\")",
      "assertField(summary, \"skipped\")",
      "assertField(summary, \"score\")",
      "assertField(summary, \"byCategory\")",
      "assertField(summary, \"byPriority\")",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_FIELD_ASSERTION_RULE,
        "json-check does not assert all stable audit summary fields.",
        missing,
        "Ensure json-check validates the audit summary status, counts, score, category counts, and priority counts.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_FIELD_ASSERTION_RULE,
      "json-check asserts audit summary stable fields.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_FINDING_FIELD_ASSERTION_RULE: AuditRule = {
  id: "JSON-013",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit finding stable fields",
  description: "json-check should assert the stable audit finding fields.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_FINDING_FIELD_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit finding field assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "function assertArray",
      "const findings = json.findings",
      "assertArray(findings)",
      "const finding = findings[0]",
      "assertField(finding, \"ruleId\")",
      "assertField(finding, \"category\")",
      "assertField(finding, \"severity\")",
      "assertField(finding, \"status\")",
      "assertField(finding, \"priority\")",
      "assertField(finding, \"message\")",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_FINDING_FIELD_ASSERTION_RULE,
        "json-check does not assert all stable audit finding fields.",
        missing,
        "Ensure json-check validates the audit finding identity, classification, status, priority, and message fields.",
      );
    }

    return pass(
      JSON_AUDIT_FINDING_FIELD_ASSERTION_RULE,
      "json-check asserts audit finding stable fields.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_RECOMMENDATION_FIELD_ASSERTION_RULE: AuditRule = {
  id: "JSON-014",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit recommendation stable fields",
  description: "json-check should assert the stable audit recommendation fields.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_FIELD_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit recommendation field assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const recommendations = json.recommendations",
      "assertArray(recommendations)",
      "const recommendation = recommendations[0]",
      "assertField(recommendation, \"ruleId\")",
      "assertField(recommendation, \"priority\")",
      "assertField(recommendation, \"message\")",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_FIELD_ASSERTION_RULE,
        "json-check does not assert all stable audit recommendation fields.",
        missing,
        "Ensure json-check validates the audit recommendation rule id, priority, and message fields.",
      );
    }

    return pass(
      JSON_AUDIT_RECOMMENDATION_FIELD_ASSERTION_RULE,
      "json-check asserts audit recommendation stable fields.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_GENERATED_AT_ASSERTION_RULE: AuditRule = {
  id: "JSON-015",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit generatedAt timestamp value",
  description: "json-check should assert that audit generatedAt is a parseable timestamp string.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_GENERATED_AT_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit generatedAt assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "function assertString",
      "assertString(json.generatedAt, \"generatedAt\")",
      "Date.parse(json.generatedAt)",
      "generatedAt must be parseable date",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_GENERATED_AT_ASSERTION_RULE,
        "json-check does not assert audit generatedAt timestamp value.",
        missing,
        "Ensure json-check validates that audit generatedAt is a parseable timestamp string.",
      );
    }

    return pass(
      JSON_AUDIT_GENERATED_AT_ASSERTION_RULE,
      "json-check asserts audit generatedAt timestamp value.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_VALUE_ASSERTION_RULE: AuditRule = {
  id: "JSON-016",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary value types",
  description: "json-check should assert the stable audit summary value types.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_VALUE_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit summary value assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "function assertNumber",
      "const summaryStatus = summary.status",
      "assertString(summaryStatus, \"summary.status\")",
      "assertOneOf(summaryStatus, \"summary.status\", AUDIT_SUMMARY_STATUSES)",
      "assertNumber(summary.total, \"summary.total\")",
      "assertNumber(summary.pass, \"summary.pass\")",
      "assertNumber(summary.warning, \"summary.warning\")",
      "assertNumber(summary.fail, \"summary.fail\")",
      "assertNumber(summary.skipped, \"summary.skipped\")",
      "assertNumber(summary.score, \"summary.score\")",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_VALUE_ASSERTION_RULE,
        "json-check does not assert all stable audit summary value types.",
        missing,
        "Ensure json-check validates audit summary status and numeric count fields.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_VALUE_ASSERTION_RULE,
      "json-check asserts audit summary value types.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_FINDING_VALUE_ASSERTION_RULE: AuditRule = {
  id: "JSON-017",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit finding value types",
  description: "json-check should assert the stable audit finding value types.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_FINDING_VALUE_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit finding value assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "assertString(finding.ruleId, \"finding.ruleId\")",
      "assertString(finding.message, \"finding.message\")",
      "const findingCategory = finding.category",
      "assertString(findingCategory, \"finding.category\")",
      "assertOneOf(findingCategory, \"finding.category\", AUDIT_CATEGORIES)",
      "const findingSeverity = finding.severity",
      "assertString(findingSeverity, \"finding.severity\")",
      "assertOneOf(findingSeverity, \"finding.severity\", AUDIT_SEVERITIES)",
      "const findingStatus = finding.status",
      "assertString(findingStatus, \"finding.status\")",
      "assertOneOf(findingStatus, \"finding.status\", AUDIT_FINDING_STATUSES)",
      "const findingPriority = finding.priority",
      "assertString(findingPriority, \"finding.priority\")",
      "assertOneOf(findingPriority, \"finding.priority\", AUDIT_PRIORITIES)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_FINDING_VALUE_ASSERTION_RULE,
        "json-check does not assert all stable audit finding value types.",
        missing,
        "Ensure json-check validates audit finding category, severity, status, priority, ruleId, and message values.",
      );
    }

    return pass(
      JSON_AUDIT_FINDING_VALUE_ASSERTION_RULE,
      "json-check asserts audit finding value types.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_RECOMMENDATION_VALUE_ASSERTION_RULE: AuditRule = {
  id: "JSON-018",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit recommendation value types",
  description: "json-check should assert the stable audit recommendation value types.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_VALUE_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit recommendation value assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "assertString(recommendation.ruleId, \"recommendation.ruleId\")",
      "assertString(recommendation.message, \"recommendation.message\")",
      "const recommendationPriority = recommendation.priority",
      "assertString(recommendationPriority, \"recommendation.priority\")",
      "assertOneOf(recommendationPriority, \"recommendation.priority\", AUDIT_PRIORITIES)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_VALUE_ASSERTION_RULE,
        "json-check does not assert all stable audit recommendation value types.",
        missing,
        "Ensure json-check validates audit recommendation ruleId, message, and priority values.",
      );
    }

    return pass(
      JSON_AUDIT_RECOMMENDATION_VALUE_ASSERTION_RULE,
      "json-check asserts audit recommendation value types.",
      expectedTokens,
    );
  },
};

export const JSON_CHECK_ENUM_ASSERTION_HELPER_RULE: AuditRule = {
  id: "JSON-019",
  category: "json",
  severity: "warning",
  title: "json-check uses enum assertion helper",
  description: "json-check should use a shared enum assertion helper for stable enum-like JSON values.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_CHECK_ENUM_ASSERTION_HELPER_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so enum assertion helper usage can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "function assertOneOf",
      "values.includes(value)",
      "values.join(\", \")",
      "assertOneOf(summaryStatus, \"summary.status\", AUDIT_SUMMARY_STATUSES)",
      "assertOneOf(findingCategory, \"finding.category\", AUDIT_CATEGORIES)",
      "assertOneOf(findingSeverity, \"finding.severity\", AUDIT_SEVERITIES)",
      "assertOneOf(findingStatus, \"finding.status\", AUDIT_FINDING_STATUSES)",
      "assertOneOf(findingPriority, \"finding.priority\", AUDIT_PRIORITIES)",
      "assertOneOf(recommendationPriority, \"recommendation.priority\", AUDIT_PRIORITIES)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_CHECK_ENUM_ASSERTION_HELPER_RULE,
        "json-check does not use a shared enum assertion helper for stable enum-like values.",
        missing,
        "Use assertOneOf for audit summary, finding, and recommendation enum-like values.",
      );
    }

    return pass(
      JSON_CHECK_ENUM_ASSERTION_HELPER_RULE,
      "json-check uses enum assertion helper.",
      expectedTokens,
    );
  },
};

export const JSON_CHECK_ENUM_VALUE_CONSTANTS_RULE: AuditRule = {
  id: "JSON-020",
  category: "json",
  severity: "warning",
  title: "json-check uses shared enum value constants",
  description: "json-check should use shared constants for stable enum-like JSON values.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_CHECK_ENUM_VALUE_CONSTANTS_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so enum value constants can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const AUDIT_SUMMARY_STATUSES = [\"pass\", \"warning\", \"fail\"] as const",
      "const AUDIT_CATEGORIES = [\"json\", \"cli\", \"docs\", \"architecture\"] as const",
      "const AUDIT_SEVERITIES = [\"error\", \"warning\"] as const",
      "const AUDIT_FINDING_STATUSES = [\"pass\", \"fail\", \"skipped\"] as const",
      "const AUDIT_PRIORITIES = [\"low\", \"medium\", \"high\"] as const",
      "assertOneOf(summaryStatus, \"summary.status\", AUDIT_SUMMARY_STATUSES)",
      "assertOneOf(findingCategory, \"finding.category\", AUDIT_CATEGORIES)",
      "assertOneOf(findingSeverity, \"finding.severity\", AUDIT_SEVERITIES)",
      "assertOneOf(findingStatus, \"finding.status\", AUDIT_FINDING_STATUSES)",
      "assertOneOf(findingPriority, \"finding.priority\", AUDIT_PRIORITIES)",
      "assertOneOf(recommendationPriority, \"recommendation.priority\", AUDIT_PRIORITIES)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_CHECK_ENUM_VALUE_CONSTANTS_RULE,
        "json-check does not use shared constants for stable enum-like values.",
        missing,
        "Define shared enum value constants and pass them to assertOneOf.",
      );
    }

    return pass(
      JSON_CHECK_ENUM_VALUE_CONSTANTS_RULE,
      "json-check uses shared enum value constants.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_GROUPED_COUNT_ASSERTION_RULE: AuditRule = {
  id: "JSON-021",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary grouped count values",
  description: "json-check should assert audit summary grouped count object values.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_GROUPED_COUNT_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so grouped summary count assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const byCategory = summary.byCategory",
      "assertRecord(byCategory)",
      "for (const category of AUDIT_CATEGORIES)",
      "assertNumber(byCategory[category], `summary.byCategory.${category}`)",
      "const byPriority = summary.byPriority",
      "assertRecord(byPriority)",
      "for (const priority of AUDIT_PRIORITIES)",
      "assertNumber(byPriority[priority], `summary.byPriority.${priority}`)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_GROUPED_COUNT_ASSERTION_RULE,
        "json-check does not assert audit summary grouped count values.",
        missing,
        "Ensure json-check validates byCategory and byPriority as objects with numeric values.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_GROUPED_COUNT_ASSERTION_RULE,
      "json-check asserts audit summary grouped count values.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_TOTAL_CONSISTENCY_RULE: AuditRule = {
  id: "JSON-022",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary total consistency",
  description: "json-check should assert audit summary total consistency against findings and status counts.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_TOTAL_CONSISTENCY_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so summary total consistency assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const summaryCountTotal = summary.pass + summary.warning + summary.fail + summary.skipped",
      "summary.total !== findings.length",
      "summary.total must match findings length",
      "summary.total !== summaryCountTotal",
      "summary.total must match summary count total",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_TOTAL_CONSISTENCY_RULE,
        "json-check does not assert audit summary total consistency.",
        missing,
        "Ensure json-check validates summary.total against findings length and status count totals.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_TOTAL_CONSISTENCY_RULE,
      "json-check asserts audit summary total consistency.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_SCORE_CONSISTENCY_RULE: AuditRule = {
  id: "JSON-023",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary score consistency",
  description: "json-check should assert audit summary score consistency against pass ratio.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_SCORE_CONSISTENCY_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so summary score consistency assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const expectedScore = summary.total === 0 ? 100 : Math.round((summary.pass / summary.total) * 100)",
      "summary.score !== expectedScore",
      "summary.score must match pass ratio",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_SCORE_CONSISTENCY_RULE,
        "json-check does not assert audit summary score consistency.",
        missing,
        "Ensure json-check validates summary.score against the pass ratio.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_SCORE_CONSISTENCY_RULE,
      "json-check asserts audit summary score consistency.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_STATUS_CONSISTENCY_RULE: AuditRule = {
  id: "JSON-024",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary status consistency",
  description: "json-check should assert audit summary status consistency against finding counts.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_STATUS_CONSISTENCY_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so summary status consistency assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const expectedStatus = summary.fail > 0 ? \"fail\" : summary.warning > 0 ? \"warning\" : \"pass\"",
      "summaryStatus !== expectedStatus",
      "summary.status must match finding counts",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_STATUS_CONSISTENCY_RULE,
        "json-check does not assert audit summary status consistency.",
        missing,
        "Ensure json-check validates summary.status against fail and warning counts.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_STATUS_CONSISTENCY_RULE,
      "json-check asserts audit summary status consistency.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_CATEGORY_COUNT_CONSISTENCY_RULE: AuditRule = {
  id: "JSON-025",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary category count consistency",
  description: "json-check should assert audit summary category counts against finding categories.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_CATEGORY_COUNT_CONSISTENCY_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so category count consistency assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const categoryCounts: Record<string, number> = {}",
      "for (const finding of findings)",
      "const category = finding.category",
      "assertOneOf(category, \"finding.category\", AUDIT_CATEGORIES)",
      "categoryCounts[category] = (categoryCounts[category] ?? 0) + 1",
      "const actualCategoryCount = category in byCategory ? byCategory[category] : 0",
      "const expectedCategoryCount = categoryCounts[category] ?? 0",
      "summary.byCategory.${category} must match finding category count",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_CATEGORY_COUNT_CONSISTENCY_RULE,
        "json-check does not assert audit summary category count consistency.",
        missing,
        "Ensure json-check validates summary.byCategory against finding categories.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_CATEGORY_COUNT_CONSISTENCY_RULE,
      "json-check asserts audit summary category count consistency.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_SUMMARY_PRIORITY_COUNT_CONSISTENCY_RULE: AuditRule = {
  id: "JSON-026",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit summary priority count consistency",
  description: "json-check should assert audit summary priority counts against finding priorities.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_SUMMARY_PRIORITY_COUNT_CONSISTENCY_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so priority count consistency assertions can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const priorityCounts: Record<string, number> = {}",
      "for (const finding of findings)",
      "const priority = finding.priority",
      "assertOneOf(priority, \"finding.priority\", AUDIT_PRIORITIES)",
      "priorityCounts[priority] = (priorityCounts[priority] ?? 0) + 1",
      "const actualPriorityCount = priority in byPriority ? byPriority[priority] : 0",
      "const expectedPriorityCount = priorityCounts[priority] ?? 0",
      "summary.byPriority.${priority} must match finding priority count",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_SUMMARY_PRIORITY_COUNT_CONSISTENCY_RULE,
        "json-check does not assert audit summary priority count consistency.",
        missing,
        "Ensure json-check validates summary.byPriority against finding priorities.",
      );
    }

    return pass(
      JSON_AUDIT_SUMMARY_PRIORITY_COUNT_CONSISTENCY_RULE,
      "json-check asserts audit summary priority count consistency.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_EVERY_FINDING_VALUE_ASSERTION_RULE: AuditRule = {
  id: "JSON-027",
  category: "json",
  severity: "warning",
  title: "json-check asserts every audit finding value",
  description: "json-check should assert value types and enum values for every audit finding.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_EVERY_FINDING_VALUE_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so every audit finding value can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "for (const findingValue of findings)",
      "assertRecord(findingValue)",
      "assertString(findingValue.ruleId, \"finding.ruleId\")",
      "assertString(findingValue.message, \"finding.message\")",
      "const findingCategoryValue = findingValue.category",
      "assertOneOf(findingCategoryValue, \"finding.category\", AUDIT_CATEGORIES)",
      "const findingSeverityValue = findingValue.severity",
      "assertOneOf(findingSeverityValue, \"finding.severity\", AUDIT_SEVERITIES)",
      "const findingStatusValue = findingValue.status",
      "assertOneOf(findingStatusValue, \"finding.status\", AUDIT_FINDING_STATUSES)",
      "const findingPriorityValue = findingValue.priority",
      "assertOneOf(findingPriorityValue, \"finding.priority\", AUDIT_PRIORITIES)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_EVERY_FINDING_VALUE_ASSERTION_RULE,
        "json-check does not assert every audit finding value.",
        missing,
        "Ensure json-check validates every finding instead of only the first finding.",
      );
    }

    return pass(
      JSON_AUDIT_EVERY_FINDING_VALUE_ASSERTION_RULE,
      "json-check asserts every audit finding value.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_EVERY_RECOMMENDATION_VALUE_ASSERTION_RULE: AuditRule = {
  id: "JSON-028",
  category: "json",
  severity: "warning",
  title: "json-check asserts every audit recommendation value",
  description: "json-check should assert value types and enum values for every audit recommendation.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_EVERY_RECOMMENDATION_VALUE_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so every audit recommendation value can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "for (const recommendationValue of recommendations)",
      "assertRecord(recommendationValue)",
      "assertString(recommendationValue.ruleId, \"recommendation.ruleId\")",
      "assertString(recommendationValue.message, \"recommendation.message\")",
      "const recommendationPriorityValue = recommendationValue.priority",
      "assertOneOf(recommendationPriorityValue, \"recommendation.priority\", AUDIT_PRIORITIES)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_EVERY_RECOMMENDATION_VALUE_ASSERTION_RULE,
        "json-check does not assert every audit recommendation value.",
        missing,
        "Ensure json-check validates every recommendation instead of only the first recommendation.",
      );
    }

    return pass(
      JSON_AUDIT_EVERY_RECOMMENDATION_VALUE_ASSERTION_RULE,
      "json-check asserts every audit recommendation value.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_FINDING_RULE_ID_UNIQUENESS_ASSERTION_RULE: AuditRule = {
  id: "JSON-029",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit finding ruleId uniqueness",
  description: "json-check should assert that every audit finding ruleId is unique.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_FINDING_RULE_ID_UNIQUENESS_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit finding ruleId uniqueness can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const findingRuleIds = new Set<string>()",
      "findingRuleIds.has(findingValue.ruleId)",
      "finding.ruleId must be unique",
      "findingRuleIds.add(findingValue.ruleId)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_FINDING_RULE_ID_UNIQUENESS_ASSERTION_RULE,
        "json-check does not assert audit finding ruleId uniqueness.",
        missing,
        "Ensure json-check rejects duplicate finding.ruleId values.",
      );
    }

    return pass(
      JSON_AUDIT_FINDING_RULE_ID_UNIQUENESS_ASSERTION_RULE,
      "json-check asserts audit finding ruleId uniqueness.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_RECOMMENDATION_RULE_ID_UNIQUENESS_ASSERTION_RULE: AuditRule = {
  id: "JSON-030",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit recommendation ruleId uniqueness",
  description: "json-check should assert that every audit recommendation ruleId is unique.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_RULE_ID_UNIQUENESS_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit recommendation ruleId uniqueness can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const recommendationRuleIds = new Set<string>()",
      "recommendationRuleIds.has(recommendationValue.ruleId)",
      "recommendation.ruleId must be unique",
      "recommendationRuleIds.add(recommendationValue.ruleId)",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_RULE_ID_UNIQUENESS_ASSERTION_RULE,
        "json-check does not assert audit recommendation ruleId uniqueness.",
        missing,
        "Ensure json-check rejects duplicate recommendation.ruleId values.",
      );
    }

    return pass(
      JSON_AUDIT_RECOMMENDATION_RULE_ID_UNIQUENESS_ASSERTION_RULE,
      "json-check asserts audit recommendation ruleId uniqueness.",
      expectedTokens,
    );
  },
};

export const JSON_AUDIT_RECOMMENDATION_RULE_ID_REFERENCE_ASSERTION_RULE: AuditRule = {
  id: "JSON-031",
  category: "json",
  severity: "warning",
  title: "json-check asserts audit recommendation ruleId references findings",
  description: "json-check should assert that every audit recommendation ruleId references an existing finding ruleId.",
  check: () => {
    const jsonCheckPath = "src/commands/json-check.ts";

    if (!existsSync(jsonCheckPath)) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_RULE_ID_REFERENCE_ASSERTION_RULE,
        "json-check command is missing.",
        [jsonCheckPath],
        "Restore src/commands/json-check.ts so audit recommendation references can be verified.",
      );
    }

    const content = readFileSync(jsonCheckPath, "utf8");
    const expectedTokens = [
      "const findingRuleIds = new Set<string>()",
      "findingRuleIds.add(findingValue.ruleId)",
      "!findingRuleIds.has(recommendationValue.ruleId)",
      "recommendation.ruleId must reference an existing finding.ruleId",
    ];

    const missing = expectedTokens.filter((token) => !content.includes(token));

    if (missing.length > 0) {
      return fail(
        JSON_AUDIT_RECOMMENDATION_RULE_ID_REFERENCE_ASSERTION_RULE,
        "json-check does not assert audit recommendation ruleId references findings.",
        missing,
        "Ensure json-check rejects recommendation.ruleId values that do not reference an existing finding.ruleId.",
      );
    }

    return pass(
      JSON_AUDIT_RECOMMENDATION_RULE_ID_REFERENCE_ASSERTION_RULE,
      "json-check asserts audit recommendation ruleId references findings.",
      expectedTokens,
    );
  },
};























