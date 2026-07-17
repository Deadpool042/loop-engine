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
  ["run", "loop-engine", "--mode", "plan", "--json"],
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

export function validateAuditJsonPayload(json: unknown): void {
  assertRecord(json);
  assertField(json, "schemaVersion");

  if (json.schemaVersion !== 1) {
    throw new Error("schemaVersion != 1");
  }

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
  assertField(summary, "recommendations");

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

  const summaryRecommendations = summary.recommendations;
  assertRecord(summaryRecommendations);
  assertField(summaryRecommendations, "total");
  assertField(summaryRecommendations, "byPriority");
  assertNumber(summaryRecommendations.total, "summary.recommendations.total");

  const summaryRecommendationsByPriority = summaryRecommendations.byPriority;
  assertRecord(summaryRecommendationsByPriority);
  for (const priority of AUDIT_PRIORITIES) {
    if (priority in summaryRecommendationsByPriority) {
      assertNumber(summaryRecommendationsByPriority[priority], `summary.recommendations.byPriority.${priority}`);
    }
  }

  for (const priority of AUDIT_PRIORITIES) {
    const actualRecommendationPriorityCount =
      priority in recommendationsByPriority ? recommendationsByPriority[priority] : 0;
    assertNumber(actualRecommendationPriorityCount, `summary.recommendationsByPriority.${priority}`);

    const actualSummaryRecommendationPriorityCount =
      priority in summaryRecommendationsByPriority ? summaryRecommendationsByPriority[priority] : 0;
    assertNumber(actualSummaryRecommendationPriorityCount, `summary.recommendations.byPriority.${priority}`);

    if (actualRecommendationPriorityCount !== actualSummaryRecommendationPriorityCount) {
      throw new Error("summary.recommendations.byPriority must match summary.recommendationsByPriority");
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

  if (summaryRecommendations.total !== recommendations.length) {
    throw new Error("summary.recommendations.total must match recommendations length");
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

    const actualSummaryRecommendationPriorityCount =
      priority in summaryRecommendationsByPriority ? summaryRecommendationsByPriority[priority] : 0;
    assertNumber(actualSummaryRecommendationPriorityCount, `summary.recommendations.byPriority.${priority}`);

    const expectedRecommendationPriorityCount = recommendationPriorityCounts[priority] ?? 0;

    if (actualRecommendationPriorityCount !== expectedRecommendationPriorityCount) {
      throw new Error(`summary.recommendationsByPriority.${priority} must match recommendation priority count`);
    }

    if (actualSummaryRecommendationPriorityCount !== expectedRecommendationPriorityCount) {
      throw new Error(`summary.recommendations.byPriority.${priority} must match recommendation priority count`);
    }
  }
}

function validatePayload(command: readonly string[], json: unknown): void {
  assertRecord(json);
  assertField(json, "schemaVersion");

  if (json.schemaVersion !== 1) {
    throw new Error("schemaVersion != 1");
  }

  const commandName = command[0];

  if (commandName === "audit") {
    validateAuditJsonPayload(json);
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
  } else if (commandName === "run") {
    assertField(json, "runId");
    assertField(json, "project");
    assertField(json, "mode");
    assertField(json, "status");
    assertField(json, "steps");
    assertField(json, "modifiedFiles");
    assertField(json, "commit");
    assertField(json, "publication");
    assertField(json, "failure");
    assertField(json, "agentPolicy");
    assertField(json, "contextPackage");

    if (json.mode !== "plan") {
      throw new Error("run json-check fixture must use mode plan");
    }
    if (!Array.isArray(json.modifiedFiles) || json.modifiedFiles.length !== 0) {
      throw new Error("run modifiedFiles must be empty in plan mode");
    }
    if (json.commit !== null) {
      throw new Error("run commit must be null in plan mode");
    }
    if (json.publication !== null) {
      throw new Error("run publication must be null in plan mode");
    }

    validateAgentPolicyField(json.agentPolicy);

    // contextPackage (V7.5) is additive and, like agentPolicy, legitimately
    // null whenever no roadmap candidate was ready (blocked/failed cycles).
    // The two fields must stay null together and non-null together: this
    // validates the *non-null* structure whenever a cycle actually
    // completed, without hardcoding an assumption about live roadmap state.
    if ((json.agentPolicy === null) !== (json.contextPackage === null)) {
      throw new Error("run contextPackage nullness must match agentPolicy nullness");
    }

    validateContextPackageField(json.contextPackage);
  }
}

const AGENT_POLICY_MODES = ["plan", "execute", "commit", "publish"] as const;
const AGENT_POLICY_STATUS_CODES = [
  "resolved",
  "no_safe_candidate",
  "no_compatible_agent",
  "policy_disabled",
  "permission_denied",
  "budget_exhausted",
  "effort_not_supported",
  "provider_not_allowed",
  "runtime_not_allowed",
] as const;

// agentPolicy (V7.4) is additive and legitimately null whenever no roadmap
// candidate was ready (blocked/failed cycles) — this validates the *shape*
// whenever the field is non-null, it never requires a candidate to exist.
function validateAgentPolicyField(agentPolicy: unknown): void {
  if (agentPolicy === null) {
    return;
  }

  assertRecord(agentPolicy);
  assertField(agentPolicy, "policyId");
  assertField(agentPolicy, "mode");
  assertField(agentPolicy, "status");
  assertField(agentPolicy, "requirements");
  assertField(agentPolicy, "selectionRequest");
  assertField(agentPolicy, "selection");
  assertField(agentPolicy, "reasons");

  assertString(agentPolicy.policyId, "agentPolicy.policyId");
  assertOneOf(agentPolicy.mode as string, "agentPolicy.mode", AGENT_POLICY_MODES);
  assertOneOf(agentPolicy.status as string, "agentPolicy.status", AGENT_POLICY_STATUS_CODES);

  const requirements = agentPolicy.requirements;
  assertRecord(requirements);
  assertField(requirements, "category");
  assertField(requirements, "requiredCapabilities");
  assertField(requirements, "requiredPermissions");
  assertField(requirements, "executionBudget");
  assertArray(requirements.requiredCapabilities);
  assertArray(requirements.requiredPermissions);

  const executionBudget = requirements.executionBudget;
  assertRecord(executionBudget);
  assertField(executionBudget, "maxCalls");

  if (agentPolicy.mode === "plan" && executionBudget.maxCalls !== 0) {
    throw new Error("agentPolicy.requirements.executionBudget.maxCalls must be 0 in mode plan");
  }

  const reasons = agentPolicy.reasons;
  assertArray(reasons);
  if (reasons.length === 0) {
    throw new Error("agentPolicy.reasons must not be empty");
  }
  for (const reason of reasons) {
    assertString(reason, "agentPolicy.reasons[]");
  }

  const selection = agentPolicy.selection;
  if (selection !== null) {
    assertRecord(selection);
    assertField(selection, "outcome");
    assertOneOf(selection.outcome as string, "agentPolicy.selection.outcome", ["selected", "no_match"]);
  }
}

const CONTEXT_SOURCE_KINDS = ["required_doc", "roadmap"] as const;
const CONTEXT_OMISSION_REASONS = [
  "duplicate",
  "missing",
  "outside_project",
  "file_limit",
  "character_limit",
  "token_limit",
] as const;

// contextPackage (V7.5) is additive, see validatePayload's "run" branch for
// the nullness contract shared with agentPolicy. This validates only the
// *shape* of a non-null MinimalContextPackage.
function validateContextPackageField(contextPackage: unknown): void {
  if (contextPackage === null) {
    return;
  }

  assertRecord(contextPackage);
  assertField(contextPackage, "project");
  assertField(contextPackage, "budget");
  assertField(contextPackage, "files");
  assertField(contextPackage, "omitted");
  assertField(contextPackage, "totalCharacters");
  assertField(contextPackage, "estimatedTokens");
  assertField(contextPackage, "truncated");

  assertString(contextPackage.project, "contextPackage.project");

  const budget = contextPackage.budget;
  assertRecord(budget);
  assertNumber(budget.maxFiles, "contextPackage.budget.maxFiles");
  assertNumber(budget.maxCharacters, "contextPackage.budget.maxCharacters");
  assertNumber(budget.maxEstimatedTokens, "contextPackage.budget.maxEstimatedTokens");
  if (typeof budget.includeFullFiles !== "boolean") {
    throw new Error("contextPackage.budget.includeFullFiles must be boolean");
  }

  const files = contextPackage.files;
  assertArray(files);
  if (files.length > budget.maxFiles) {
    throw new Error("contextPackage.files.length must not exceed contextPackage.budget.maxFiles");
  }
  for (const file of files) {
    assertRecord(file);
    assertString(file.path, "contextPackage.files[].path");
    assertOneOf(file.kind as string, "contextPackage.files[].kind", CONTEXT_SOURCE_KINDS);
    assertString(file.content, "contextPackage.files[].content");
    assertNumber(file.originalCharacters, "contextPackage.files[].originalCharacters");
    assertNumber(file.includedCharacters, "contextPackage.files[].includedCharacters");
    assertNumber(file.estimatedTokens, "contextPackage.files[].estimatedTokens");
    if (typeof file.truncated !== "boolean") {
      throw new Error("contextPackage.files[].truncated must be boolean");
    }
    if (file.includedCharacters > file.originalCharacters) {
      throw new Error("contextPackage.files[].includedCharacters must not exceed originalCharacters");
    }
  }

  const omitted = contextPackage.omitted;
  assertArray(omitted);
  for (const omission of omitted) {
    assertRecord(omission);
    assertString(omission.path, "contextPackage.omitted[].path");
    assertOneOf(omission.reason as string, "contextPackage.omitted[].reason", CONTEXT_OMISSION_REASONS);
  }

  assertNumber(contextPackage.totalCharacters, "contextPackage.totalCharacters");
  assertNumber(contextPackage.estimatedTokens, "contextPackage.estimatedTokens");
  if (contextPackage.totalCharacters > budget.maxCharacters) {
    throw new Error("contextPackage.totalCharacters must not exceed contextPackage.budget.maxCharacters");
  }
  if (contextPackage.estimatedTokens > budget.maxEstimatedTokens) {
    throw new Error("contextPackage.estimatedTokens must not exceed contextPackage.budget.maxEstimatedTokens");
  }
  if (typeof contextPackage.truncated !== "boolean") {
    throw new Error("contextPackage.truncated must be boolean");
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
