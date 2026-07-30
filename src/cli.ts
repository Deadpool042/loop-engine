import { printProjectContext, printProjectContextJson } from "./commands/context.js";
import { printProjectHandoff, printProjectHandoffJson } from "./commands/handoff.js";
import { validateProject } from "./commands/validate.js";
import { printReviewContext, printReviewContextJson } from "./commands/review.js";
import { printWorkspaceSummary, printWorkspaceSummaryJson } from "./commands/summary.js";
import { printHelp } from "./commands/help.js";
import { runJsonCheck } from "./commands/json-check.js";
import { runRagIndex } from "./commands/rag-index.js";
import { runRagSearch } from "./commands/rag-search.js";
import { printNextProjectAction, printNextProjectActionJson } from "./commands/next.js";
import { printProjectPrompt, printProjectPromptJson } from "./commands/prompt.js";
import { printStatus } from "./commands/status.js";
import { printDoctor } from "./commands/doctor.js";
import { printAuditReport, printAuditReportJson, printAuditRuleManifest } from "./commands/audit.js";
import { isLoopRunMode, runLoopRunCommand } from "./commands/run.js";
import { findProject, getRequiredProjectName, loadConfig } from "./core/index.js";
import { terminal } from "./ui/terminal.js";
import { printJsonError } from "./commands/json-error.js";

function resolveProjectOrExit(commandName: string) {
  const config = loadConfig();
  if (!process.argv[3] || process.argv[3].startsWith("--")) {
    if (process.argv.includes("--json")) printJsonError("missing_project", `Missing project argument for ${commandName}`);
    else terminal.error(`Missing project argument for ${commandName}`);
    process.exit(1);
  }
  const projectName = getRequiredProjectName(process.argv, commandName);
  const project = findProject(config, projectName);
  if (!project) {
    if (process.argv.includes("--json")) printJsonError("unknown_project", `Unknown project: ${projectName}`);
    else terminal.error(`Unknown project: ${projectName}`);
    process.exit(1);
  }
  return project;
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function hasOption(name: string): boolean {
  return process.argv.includes(name);
}

function failOption(json: boolean, code: Parameters<typeof printJsonError>[0], message: string): never {
  if (json) printJsonError(code, message);
  else terminal.error(message);
  process.exit(1);
}

const command = process.argv[2] ?? "help";
if (command === "help" || command === "--help" || command === "-h") printHelp();
else if (command === "summary" && process.argv.includes("--json")) printWorkspaceSummaryJson(loadConfig());
else if (command === "status") printStatus(loadConfig());
else if (command === "summary") printWorkspaceSummary(loadConfig());
else if (command === "json-check") runJsonCheck();
else if (command === "rag-index") runRagIndex();
else if (command === "rag-search") {
  const json = process.argv.includes("--json");
  const limitValue = optionValue("--limit");
  const pathPrefix = optionValue("--path");
  const query = process.argv.slice(3).filter((argument, index, list) =>
    !["--", "--json", "--limit", "--path"].includes(argument) &&
    !["--limit", "--path"].includes(list[index - 1] ?? ""),
  ).join(" ");
  runRagSearch(query, {
    ...(json ? { json } : {}),
    ...(limitValue ? { limit: Number.parseInt(limitValue, 10) } : {}),
    ...(pathPrefix ? { pathPrefix } : {}),
  });
} else if (command === "doctor") printDoctor(loadConfig());
else if (command === "audit") {
  if (process.argv.includes("--manifest")) {
    if (process.argv.includes("--strict")) {
      terminal.error("--strict cannot be used with --manifest");
      process.exit(1);
    }
    printAuditRuleManifest();
  } else {
    const strict = process.argv.includes("--strict");
    const report = process.argv.includes("--json") ? printAuditReportJson() : printAuditReport();
    if (strict && report.summary.status !== "pass") process.exitCode = 1;
  }
} else if (command === "handoff") {
  const project = resolveProjectOrExit("handoff");
  process.argv.includes("--json") ? printProjectHandoffJson(project) : printProjectHandoff(project);
} else if (command === "context") {
  const project = resolveProjectOrExit("context");
  process.argv.includes("--json") ? printProjectContextJson(project) : printProjectContext(project);
} else if (command === "validate") await validateProject(resolveProjectOrExit("validate"));
else if (command === "review") {
  const project = resolveProjectOrExit("review");
  process.argv.includes("--json") ? printReviewContextJson(project) : printReviewContext(project);
} else if (command === "next") {
  const project = resolveProjectOrExit("next");
  process.argv.includes("--json") ? printNextProjectActionJson(project) : printNextProjectAction(project);
} else if (command === "prompt") {
  const project = resolveProjectOrExit("prompt");
  process.argv.includes("--json") ? printProjectPromptJson(project) : printProjectPrompt(project);
} else if (command === "run") {
  const project = resolveProjectOrExit("run");
  const json = process.argv.includes("--json");

  const modeValue = optionValue("--mode");
  if (hasOption("--mode") && modeValue === undefined) {
    failOption(json, "missing_mode_value", "Missing value for --mode");
  }
  const mode = modeValue ?? "plan";
  if (!isLoopRunMode(mode)) {
    failOption(json, "unknown_mode", `Unknown loop run mode: ${mode}`);
  }

  const maxRepairsOption = optionValue("--max-repairs");
  if (hasOption("--max-repairs") && maxRepairsOption === undefined) {
    failOption(json, "missing_max_repairs_value", "Missing value for --max-repairs");
  }
  const maxRepairsValue = maxRepairsOption ?? "0";
  const maxRepairs = Number(maxRepairsValue);
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0) {
    failOption(json, "invalid_max_repairs", `Invalid --max-repairs value: ${maxRepairsValue}`);
  }

  const timeoutValue = optionValue("--provider-timeout-ms");
  if (hasOption("--provider-timeout-ms") && timeoutValue === undefined) {
    failOption(json, "invalid_provider_timeout", "Missing value for --provider-timeout-ms");
  }
  const providerTimeoutMs = timeoutValue === undefined ? undefined : Number(timeoutValue);
  if (providerTimeoutMs !== undefined && (!Number.isInteger(providerTimeoutMs) || providerTimeoutMs <= 0)) {
    failOption(json, "invalid_provider_timeout", `Invalid --provider-timeout-ms value: ${timeoutValue}`);
  }

  const providerValue = optionValue("--provider");
  if (hasOption("--provider") && providerValue === undefined) {
    failOption(json, "unsupported_provider", "Missing value for --provider");
  }
  if (providerValue !== undefined && providerValue !== "codex") {
    failOption(json, "unsupported_provider", `Unsupported provider: ${providerValue}`);
  }

  const providerExecutable = optionValue("--provider-executable");
  const providerModel = optionValue("--provider-model");
  const commitMessage = optionValue("--commit-message");
  const exitCode = await runLoopRunCommand(project, mode, json, {
    maxRepairs,
    ...(providerValue === "codex" ? { provider: "codex" as const } : {}),
    ...(providerExecutable !== undefined ? { providerExecutable } : {}),
    ...(providerModel !== undefined ? { providerModel } : {}),
    ...(providerTimeoutMs !== undefined ? { providerTimeoutMs } : {}),
    ...(commitMessage !== undefined ? { commitMessage } : {}),
  });
  if (exitCode !== 0) process.exitCode = exitCode;
} else {
  terminal.error("Usage: pnpm loop help|summary|status|doctor|context <project>|validate <project>|review <project>|next <project>|prompt <project>|run <project>");
  process.exit(1);
}
