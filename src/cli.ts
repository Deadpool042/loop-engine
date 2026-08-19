import {
  printProjectContext,
  printProjectContextJson,
} from "./commands/context.js";
import {
  printProjectHandoff,
  printProjectHandoffJson,
} from "./commands/handoff.js";
import { validateProject } from "./commands/validate.js";
import {
  printReviewContext,
  printReviewContextJson,
} from "./commands/review.js";
import {
  printWorkspaceSummary,
  printWorkspaceSummaryJson,
} from "./commands/summary.js";
import { startWorkspaceSummaryServer } from "./commands/serve-summary.js";
import { printHelp } from "./commands/help.js";
import { runJsonCheck } from "./commands/json-check.js";
import { runRagIndex } from "./commands/rag-index.js";
import { runRagSearch } from "./commands/rag-search.js";
import {
  printNextProjectAction,
  printNextProjectActionJson,
} from "./commands/next.js";
import {
  printProjectPrompt,
  printProjectPromptJson,
} from "./commands/prompt.js";
import { printStatus } from "./commands/status.js";
import { printDoctor } from "./commands/doctor.js";
import {
  printRoadmapStatus,
  printRoadmapStatusJson,
} from "./commands/roadmap.js";
import {
  printProjectObjective,
  printProjectObjectiveJson,
} from "./commands/objective.js";
import {
  printRoadmapProposalContext,
  printRoadmapProposalContextJson,
} from "./commands/proposal-context.js";
import {
  printRoadmapProposal,
  printRoadmapProposalJson,
} from "./commands/roadmap-propose.js";
import {
  printAuditReport,
  printAuditReportJson,
  printAuditRuleManifest,
} from "./commands/audit.js";
import { isLoopRunMode, runLoopRunCommand } from "./commands/run.js";
import {
  createLoopApplicationAssembly,
  LOOP_PROVIDER_IDS,
  type LoopApplicationAssembly,
  type LoopProviderConfiguration,
  type LoopProviderId,
} from "./composition/index.js";
import { terminal } from "./ui/terminal.js";
import { printJsonError } from "./commands/json-error.js";

const application = createLoopApplicationAssembly();

function resolveProjectOrExit(commandName: string, argumentIndex = 3) {
  const config = application.loadConfig();
  if (
    !process.argv[argumentIndex] ||
    process.argv[argumentIndex].startsWith("--")
  ) {
    if (process.argv.includes("--json"))
      printJsonError(
        "missing_project",
        `Missing project argument for ${commandName}`,
      );
    else terminal.error(`Missing project argument for ${commandName}`);
    process.exit(1);
  }
  const projectName = application.getRequiredProjectName(
    process.argv,
    commandName,
    argumentIndex,
  );
  const project = application.findProject(config, projectName);
  if (!project) {
    if (process.argv.includes("--json"))
      printJsonError("unknown_project", `Unknown project: ${projectName}`);
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

function isLoopProviderId(value: string): value is LoopProviderId {
  return (LOOP_PROVIDER_IDS as readonly string[]).includes(value);
}

function providerLabel(provider: LoopProviderId): string {
  return provider === "claude_code" ? "Claude Code" : "Codex";
}

function providerExecutableName(provider: LoopProviderId): string {
  return provider === "claude_code" ? "claude" : "codex";
}

function failOption(
  json: boolean,
  code: Parameters<typeof printJsonError>[0],
  message: string,
): never {
  if (json) printJsonError(code, message);
  else terminal.error(message);
  process.exit(1);
}

const command = process.argv[2] ?? "help";
if (command === "help" || command === "--help" || command === "-h") printHelp();
else if (command === "summary" && process.argv.includes("--json"))
  printWorkspaceSummaryJson(application, application.loadConfig());
else if (command === "serve-summary") startWorkspaceSummaryServer(application);
else if (command === "status")
  printStatus(application, application.loadConfig());
else if (command === "summary")
  printWorkspaceSummary(application, application.loadConfig());
else if (command === "json-check") runJsonCheck();
else if (command === "rag-index") runRagIndex(application);
else if (command === "rag-search") {
  const json = process.argv.includes("--json");
  const limitValue = optionValue("--limit");
  const pathPrefix = optionValue("--path");
  const query = process.argv
    .slice(3)
    .filter(
      (argument, index, list) =>
        !["--", "--json", "--limit", "--path"].includes(argument) &&
        !["--limit", "--path"].includes(list[index - 1] ?? ""),
    )
    .join(" ");
  runRagSearch(application, query, {
    ...(json ? { json } : {}),
    ...(limitValue ? { limit: Number.parseInt(limitValue, 10) } : {}),
    ...(pathPrefix ? { pathPrefix } : {}),
  });
} else if (command === "doctor")
  printDoctor(application, application.loadConfig());
else if (command === "roadmap" && process.argv[3] === "status") {
  const project = resolveProjectOrExit("roadmap status", 4);
  process.argv.includes("--json")
    ? printRoadmapStatusJson(application, project)
    : printRoadmapStatus(application, project);
} else if (command === "roadmap" && process.argv[3] === "objective") {
  const project = resolveProjectOrExit("roadmap objective", 4);
  process.argv.includes("--json")
    ? printProjectObjectiveJson(application, project)
    : printProjectObjective(application, project);
} else if (command === "roadmap" && process.argv[3] === "proposal-context") {
  const project = resolveProjectOrExit("roadmap proposal-context", 4);
  process.argv.includes("--json")
    ? printRoadmapProposalContextJson(application, project)
    : printRoadmapProposalContext(application, project);
} else if (command === "roadmap" && process.argv[3] === "propose") {
  const json = process.argv.includes("--json");
  const project = resolveProjectOrExit("roadmap propose", 4);
  const provider = optionValue("--provider");
  const model = optionValue("--provider-model");
  const timeoutValue = optionValue("--provider-timeout-ms");
  if (provider !== "anthropic_api") failOption(json, "unsupported_provider", "--provider anthropic_api is required.");
  if (!model) failOption(json, "missing_provider_model", "--provider-model is required.");
  if (hasOption("--provider-timeout-ms") && timeoutValue === undefined)
    failOption(json, "invalid_provider_timeout", "Missing value for --provider-timeout-ms");
  const timeoutMs = timeoutValue === undefined ? 60_000 : Number(timeoutValue);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000)
    failOption(json, "invalid_provider_timeout", "Invalid --provider-timeout-ms value.");
  json
    ? await printRoadmapProposalJson(application, project, { model, timeoutMs })
    : await printRoadmapProposal(application, project, { model, timeoutMs });
} else if (command === "roadmap") {
  terminal.error(
    "Usage: pnpm loop roadmap status|objective|proposal-context <project> [--json] | roadmap propose <project> --provider anthropic_api --provider-model <model> [--provider-timeout-ms <ms>] [--json]",
  );
  process.exit(1);
} else if (command === "audit") {
  if (process.argv.includes("--manifest")) {
    if (process.argv.includes("--strict")) {
      terminal.error("--strict cannot be used with --manifest");
      process.exit(1);
    }
    printAuditRuleManifest(application);
  } else {
    const strict = process.argv.includes("--strict");
    const report = process.argv.includes("--json")
      ? printAuditReportJson(application)
      : printAuditReport(application);
    if (strict && report.summary.status !== "pass") process.exitCode = 1;
  }
} else if (command === "handoff") {
  const project = resolveProjectOrExit("handoff");
  process.argv.includes("--json")
    ? printProjectHandoffJson(application, project)
    : printProjectHandoff(application, project);
} else if (command === "context") {
  const project = resolveProjectOrExit("context");
  process.argv.includes("--json")
    ? printProjectContextJson(application, project)
    : printProjectContext(application, project);
} else if (command === "validate")
  await validateProject(application, resolveProjectOrExit("validate"));
else if (command === "review") {
  const project = resolveProjectOrExit("review");
  process.argv.includes("--json")
    ? printReviewContextJson(application, project)
    : printReviewContext(application, project);
} else if (command === "next") {
  const project = resolveProjectOrExit("next");
  process.argv.includes("--json")
    ? printNextProjectActionJson(application, project)
    : printNextProjectAction(application, project);
} else if (command === "prompt") {
  const project = resolveProjectOrExit("prompt");
  process.argv.includes("--json")
    ? printProjectPromptJson(application, project)
    : printProjectPrompt(application, project);
} else if (command === "run") {
  const project = resolveProjectOrExit("run");
  const json = process.argv.includes("--json");

  const modeValue = optionValue("--mode");
  if (hasOption("--mode") && modeValue === undefined) {
    failOption(json, "missing_mode_value", "Missing value for --mode");
  }
  const mode = modeValue ?? "plan";
  if (!isLoopRunMode(application, mode)) {
    failOption(json, "unknown_mode", `Unknown loop run mode: ${mode}`);
  }

  const maxRepairsOption = optionValue("--max-repairs");
  if (hasOption("--max-repairs") && maxRepairsOption === undefined) {
    failOption(
      json,
      "missing_max_repairs_value",
      "Missing value for --max-repairs",
    );
  }
  const maxRepairsValue = maxRepairsOption ?? "0";
  const maxRepairs = Number(maxRepairsValue);
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0) {
    failOption(
      json,
      "invalid_max_repairs",
      `Invalid --max-repairs value: ${maxRepairsValue}`,
    );
  }

  const timeoutValue = optionValue("--provider-timeout-ms");
  if (hasOption("--provider-timeout-ms") && timeoutValue === undefined) {
    failOption(
      json,
      "invalid_provider_timeout",
      "Missing value for --provider-timeout-ms",
    );
  }
  const providerTimeoutMs =
    timeoutValue === undefined ? undefined : Number(timeoutValue);
  if (
    providerTimeoutMs !== undefined &&
    (!Number.isInteger(providerTimeoutMs) || providerTimeoutMs <= 0)
  ) {
    failOption(
      json,
      "invalid_provider_timeout",
      `Invalid --provider-timeout-ms value: ${timeoutValue}`,
    );
  }

  const providerValue = optionValue("--provider");
  if (hasOption("--provider") && providerValue === undefined) {
    failOption(json, "unsupported_provider", "Missing value for --provider");
  }
  const providerId =
    providerValue === undefined
      ? undefined
      : isLoopProviderId(providerValue)
        ? providerValue
        : failOption(
            json,
            "unsupported_provider",
            `Unsupported provider: ${providerValue}`,
          );

  const providerExecutable = optionValue("--provider-executable");
  const providerModel = optionValue("--provider-model");
  const candidateId = optionValue("--candidate");
  const commitMessage = optionValue("--commit-message");
  const exportPatchPath = optionValue("--export-patch");
  const progressEvents = hasOption("--progress-events");

  if (hasOption("--candidate") && candidateId === undefined) {
    failOption(json, "missing_candidate_value", "Missing value for --candidate");
  }
  if (candidateId !== undefined && mode !== "plan" && mode !== "execute") {
    failOption(
      json,
      "candidate_plan_or_execute_only",
      "--candidate is only supported in plan or execute mode.",
    );
  }

  if (hasOption("--export-patch") && exportPatchPath === undefined) {
    failOption(
      json,
      "missing_export_patch_value",
      "Missing value for --export-patch",
    );
  }
  if (exportPatchPath !== undefined && mode !== "execute") {
    failOption(
      json,
      "export_patch_execute_only",
      "--export-patch is only supported in execute mode.",
    );
  }
  if (exportPatchPath !== undefined && providerId === undefined) {
    failOption(
      json,
      "export_patch_requires_provider",
      "--export-patch requires an explicit provider.",
    );
  }
  if (progressEvents && (mode !== "execute" || !json)) {
    failOption(
      json,
      "progress_events_execute_json_only",
      "--progress-events requires execute mode with --json.",
    );
  }

  if (
    mode !== "publish" &&
    providerId !== undefined &&
    providerExecutable === undefined
  ) {
    failOption(
      json,
      "missing_provider_executable",
      `${providerLabel(providerId)} provider requires --provider-executable.`,
    );
  }

  let runApplication: LoopApplicationAssembly = application;
  if (
    mode !== "publish" &&
    providerId !== undefined &&
    providerExecutable !== undefined
  ) {
    const provider: LoopProviderConfiguration =
      providerId === "codex"
        ? {
            id: "codex",
            executable: providerExecutable,
            ...(providerModel ? { model: providerModel } : {}),
            ...(providerTimeoutMs ? { timeoutMs: providerTimeoutMs } : {}),
          }
        : {
            id: "claude_code",
            executable: providerExecutable,
            ...(providerModel ? { model: providerModel } : {}),
            ...(providerTimeoutMs ? { timeoutMs: providerTimeoutMs } : {}),
          };

    try {
      runApplication = createLoopApplicationAssembly({ provider });
    } catch {
      failOption(
        json,
        "invalid_provider_executable",
        `${providerLabel(providerId)} provider executable must resolve to a command named ${providerExecutableName(providerId)}.`,
      );
    }
  }

  const exitCode = await runLoopRunCommand(
    runApplication,
    project,
    mode,
    json,
    {
      ...(candidateId !== undefined ? { candidateId } : {}),
      maxRepairs,
      ...(providerId !== undefined ? { provider: providerId } : {}),
      ...(commitMessage !== undefined ? { commitMessage } : {}),
      ...(exportPatchPath !== undefined ? { exportPatchPath } : {}),
      ...(progressEvents
        ? {
            onProgress(event) {
              process.stderr.write(
                `LOOP_EXECUTION_EVENT:${JSON.stringify({ status: event.status })}\n`,
              );
            },
          }
        : {}),
    },
  );
  if (exitCode !== 0) process.exitCode = exitCode;
} else {
  terminal.error(
    "Usage: pnpm loop help|summary|status|doctor|roadmap status|objective|proposal-context <project>|context <project>|validate <project>|review <project>|next <project>|prompt <project>|run <project>",
  );
  process.exit(1);
}
