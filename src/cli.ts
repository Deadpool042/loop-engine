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
  printRoadmapOverview,
  printRoadmapOverviewJson,
} from "./commands/roadmap-overview.js";
import {
  printRoadmapCandidateDetail,
  printRoadmapCandidateDetailJson,
} from "./commands/roadmap-detail.js";
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
  printRoadmapProposalEstimate,
  printRoadmapProposalEstimateJson,
} from "./commands/roadmap-propose-estimate.js";
import {
  printRoadmapDecision,
  printRoadmapDecisionJson,
} from "./commands/roadmap-decision.js";
import {
  printGateReassessment,
  printGateReassessmentEstimateJson,
  printGateReassessmentJson,
} from "./commands/gate-reassess.js";
import {
  ANTHROPIC_EFFORT_VALUES,
  createAnthropicApiProvider,
  createOpenClawInferProvider,
  hasAnthropicApiCredential,
} from "./text-only-provider/index.js";
import { ANTHROPIC_SONNET_5_MODEL } from "./text-only-provider/pricing.js";
import {
  printAuditReport,
  printAuditReportJson,
  printAuditRuleManifest,
} from "./commands/audit.js";
import { isLoopRunMode, runLoopRunCommand } from "./commands/run.js";
import { printRunHistory } from "./commands/runs.js";
import { printRunHistoryLookup } from "./commands/run-history-lookup.js";
import { printCandidatePublicationReview } from "./commands/candidate-review.js";
import {
  createLoopApplicationAssembly,
  LOOP_PROVIDER_IDS,
  type LoopApplicationAssembly,
  type LoopProviderConfiguration,
  type LoopProviderId,
} from "./composition/index.js";
import { terminal } from "./ui/terminal.js";
import { printJsonError } from "./commands/json-error.js";
import { printExecutionDecisionProposalJson } from "./commands/execution-decision-propose.js";
import { printExecutionDecisionCurrentJson } from "./commands/execution-decision-current.js";
import {
  materializeWorkspaceProjectCommand,
  printWorkspacePortfolioStatusJson,
  printWorkspaceProjectStatus,
  printWorkspaceProjectStatusJson,
} from "./commands/workspace.js";
import { registerProjectEnvelopeCommand } from "./commands/project-register.js";

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
else if (command === "workspace" && process.argv[3] === "status") {
  const json = process.argv.includes("--json");
  const projectArgument = process.argv[4];
  if (!projectArgument || projectArgument.startsWith("--")) {
    if (json)
      printWorkspacePortfolioStatusJson(application, application.loadConfig());
    else terminal.error("Usage: pnpm loop workspace status <project> [--json]");
  } else {
    const project = resolveProjectOrExit("workspace status", 4);
    json
      ? printWorkspaceProjectStatusJson(application, project)
      : printWorkspaceProjectStatus(application, project);
  }
} else if (command === "workspace" && process.argv[3] === "materialize") {
  const json = process.argv.includes("--json");
  const config = application.loadConfig();
  const project = resolveProjectOrExit("workspace materialize", 4);
  const exitCode = materializeWorkspaceProjectCommand(
    application,
    config,
    project,
    json,
  );
  if (exitCode !== 0) process.exitCode = exitCode;
} else if (command === "project" && process.argv[3] === "register") {
  const json = process.argv.includes("--json");
  const projectName = process.argv[4];
  const type = optionValue("--type");
  const confirmed = hasOption("--confirm-brief-approved");
  if (!projectName || projectName.startsWith("--")) {
    failOption(json, "missing_project", "Missing project argument for project register");
  }
  if (!type) {
    failOption(json, "missing_project_type", "--type is required for project register");
  }
  if (!confirmed) {
    failOption(
      json,
      "brief_approval_required",
      "--confirm-brief-approved is required for project register",
    );
  }
  const exitCode = registerProjectEnvelopeCommand(
    application,
    process.cwd(),
    projectName,
    type,
    true,
    json,
  );
  if (exitCode !== 0) process.exitCode = exitCode;
} else if (command === "roadmap" && process.argv[3] === "status") {
  const project = resolveProjectOrExit("roadmap status", 4);
  process.argv.includes("--json")
    ? printRoadmapStatusJson(application, project)
    : printRoadmapStatus(application, project);
} else if (command === "roadmap" && process.argv[3] === "overview") {
  const project = resolveProjectOrExit("roadmap overview", 4);
  process.argv.includes("--json")
    ? printRoadmapOverviewJson(application, project)
    : printRoadmapOverview(application, project);
} else if (command === "roadmap" && process.argv[3] === "detail") {
  const json = process.argv.includes("--json");
  const project = resolveProjectOrExit("roadmap detail", 4);
  const candidateKey = optionValue("--candidate-key");
  if (!candidateKey) {
    failOption(
      json,
      "missing_candidate_value",
      "--candidate-key is required for roadmap detail",
    );
  }
  json
    ? printRoadmapCandidateDetailJson(application, project, candidateKey)
    : printRoadmapCandidateDetail(application, project, candidateKey);
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
} else if (command === "roadmap" && process.argv[3] === "propose-estimate") {
  const project = resolveProjectOrExit("roadmap propose-estimate", 4);
  process.argv.includes("--json")
    ? printRoadmapProposalEstimateJson(application, project)
    : printRoadmapProposalEstimate(application, project);
} else if (command === "roadmap" && process.argv[3] === "propose") {
  const json = process.argv.includes("--json");
  const project = resolveProjectOrExit("roadmap propose", 4);
  const provider = optionValue("--provider");
  const model = optionValue("--provider-model");
  const effort = optionValue("--provider-effort");
  const timeoutValue = optionValue("--provider-timeout-ms");
  if (provider !== "anthropic_api")
    failOption(
      json,
      "unsupported_provider",
      "--provider anthropic_api is required.",
    );
  if (hasOption("--provider-timeout-ms") && timeoutValue === undefined)
    failOption(
      json,
      "invalid_provider_timeout",
      "Missing value for --provider-timeout-ms",
    );
  const timeoutMs = timeoutValue === undefined ? 60_000 : Number(timeoutValue);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000)
    failOption(
      json,
      "invalid_provider_timeout",
      "Invalid --provider-timeout-ms value.",
    );
  // --provider-model is optional: when omitted, the model and effort are chosen
  // deterministically by the cost-aware routing policy (no --provider-effort allowed then).
  if (hasOption("--provider-effort") && effort === undefined)
    failOption(
      json,
      "invalid_provider_effort",
      "Missing value for --provider-effort",
    );
  if (effort !== undefined && !model)
    failOption(
      json,
      "provider_effort_requires_provider_model",
      "--provider-effort requires an explicit --provider-model.",
    );
  if (
    effort !== undefined &&
    !(ANTHROPIC_EFFORT_VALUES as readonly string[]).includes(effort)
  )
    failOption(
      json,
      "invalid_provider_effort",
      "Invalid --provider-effort value.",
    );
  const input = {
    ...(model ? { model } : {}),
    ...(effort
      ? { effort: effort as (typeof ANTHROPIC_EFFORT_VALUES)[number] }
      : {}),
    timeoutMs,
  };
  json
    ? await printRoadmapProposalJson(application, project, input)
    : await printRoadmapProposal(application, project, input);
} else if (command === "roadmap" && process.argv[3] === "decision") {
  const json = process.argv.includes("--json");
  const project = resolveProjectOrExit("roadmap decision", 4);
  const requestProposal = process.argv.includes("--request-proposal");

  if (!requestProposal) {
    json
      ? await printRoadmapDecisionJson(application, project, {})
      : await printRoadmapDecision(application, project, {});
  } else {
    const provider = optionValue("--provider");
    const model = optionValue("--provider-model");
    const effort = optionValue("--provider-effort");
    const timeoutValue = optionValue("--provider-timeout-ms");
    if (provider !== "anthropic_api" && provider !== "openclaw_agent")
      failOption(
        json,
        "unsupported_provider",
        "--provider must be anthropic_api or openclaw_agent with --request-proposal.",
      );
    if (provider === "openclaw_agent" && model === undefined)
      failOption(
        json,
        "missing_provider_model",
        "--provider-model is required with --provider openclaw_agent.",
      );
    if (hasOption("--provider-timeout-ms") && timeoutValue === undefined)
      failOption(
        json,
        "invalid_provider_timeout",
        "Missing value for --provider-timeout-ms",
      );
    const timeoutMs =
      timeoutValue === undefined ? 60_000 : Number(timeoutValue);
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1_000 ||
      timeoutMs > 120_000
    )
      failOption(
        json,
        "invalid_provider_timeout",
        "Invalid --provider-timeout-ms value.",
      );
    if (hasOption("--provider-effort") && effort === undefined)
      failOption(
        json,
        "invalid_provider_effort",
        "Missing value for --provider-effort",
      );
    if (effort !== undefined && !model)
      failOption(
        json,
        "provider_effort_requires_provider_model",
        "--provider-effort requires an explicit --provider-model.",
      );
    if (
      effort !== undefined &&
      !(ANTHROPIC_EFFORT_VALUES as readonly string[]).includes(effort)
    )
      failOption(
        json,
        "invalid_provider_effort",
        "Invalid --provider-effort value.",
      );
    const input = {
      requestProposal: {
        ...(model ? { model } : {}),
        ...(effort
          ? { effort: effort as (typeof ANTHROPIC_EFFORT_VALUES)[number] }
          : {}),
        timeoutMs,
      },
    };
    const proposalApplication =
      provider === "openclaw_agent"
        ? createLoopApplicationAssembly({
            textOnlyProvider: createOpenClawInferProvider(),
            textOnlyProviderCredentialAvailable: () => true,
          })
        : createLoopApplicationAssembly({
            textOnlyProvider: createAnthropicApiProvider(),
            textOnlyProviderCredentialAvailable: hasAnthropicApiCredential,
          });
    json
      ? await printRoadmapDecisionJson(proposalApplication, project, input)
      : await printRoadmapDecision(proposalApplication, project, input);
  }
} else if (
  command === "roadmap" &&
  process.argv[3] === "reassess-gates-estimate"
) {
  const project = resolveProjectOrExit("roadmap reassess-gates-estimate", 4);
  printGateReassessmentEstimateJson(application, project);
} else if (command === "roadmap" && process.argv[3] === "reassess-gates") {
  const json = process.argv.includes("--json");
  const project = resolveProjectOrExit("roadmap reassess-gates", 4);
  const provider = optionValue("--provider");
  const model = optionValue("--provider-model");
  const effort = optionValue("--provider-effort");
  const timeoutMs = Number(optionValue("--provider-timeout-ms") ?? "60000");
  if (provider !== "anthropic_api")
    failOption(
      json,
      "unsupported_provider",
      "--provider anthropic_api is required.",
    );
  if (
    effort !== undefined &&
    (!model || !(ANTHROPIC_EFFORT_VALUES as readonly string[]).includes(effort))
  )
    failOption(
      json,
      "invalid_provider_effort",
      "Invalid --provider-effort value.",
    );
  const input = {
    ...(model ? { model } : {}),
    ...(effort
      ? { effort: effort as (typeof ANTHROPIC_EFFORT_VALUES)[number] }
      : {}),
    timeoutMs,
  };
  json
    ? await printGateReassessmentJson(application, project, input)
    : await printGateReassessment(application, project, input);
} else if (command === "execution-decision" && process.argv[3] === "propose") {
  const json = process.argv.includes("--json");
  const project = resolveProjectOrExit("execution-decision propose", 4);
  const candidateId = optionValue("--candidate");
  const sourceDocument = optionValue("--source-document");
  const gitHead = optionValue("--git-head");
  const provider = optionValue("--provider");
  const model = optionValue("--provider-model");
  const effort = optionValue("--provider-effort");
  const timeoutValue = optionValue("--provider-timeout-ms");
  if (!candidateId || !sourceDocument || !gitHead)
    failOption(
      json,
      "missing_candidate_value",
      "--candidate, --source-document, and --git-head are required.",
    );
  if (provider !== "anthropic_api")
    failOption(
      json,
      "unsupported_provider",
      "--provider anthropic_api is required.",
    );
  if (model !== ANTHROPIC_SONNET_5_MODEL)
    failOption(
      json,
      "missing_provider_model",
      "--provider-model claude-sonnet-5 is required.",
    );
  if (effort !== "low")
    failOption(
      json,
      "invalid_provider_effort",
      "--provider-effort low is required.",
    );
  if (timeoutValue !== "60000")
    failOption(
      json,
      "invalid_provider_timeout",
      "--provider-timeout-ms 60000 is required.",
    );
  if (json)
    await printExecutionDecisionProposalJson(application, {
      project: project.name,
      candidateId,
      sourceDocument,
      gitHead,
      provider,
      model,
      effort,
      timeoutMs: 60_000,
    });
  else terminal.info("Execution-decision propose requires --json.");
} else if (command === "execution-decision" && process.argv[3] === "current") {
  const project = resolveProjectOrExit("execution-decision current", 4);
  if (process.argv.includes("--json"))
    printExecutionDecisionCurrentJson(application, project.name);
  else terminal.info("Execution-decision current requires --json.");
} else if (command === "roadmap") {
  terminal.error(
    "Usage: pnpm loop roadmap status|overview|objective|proposal-context <project> [--json] | roadmap propose-estimate <project> [--json] | roadmap propose <project> --provider anthropic_api [--provider-model <model> [--provider-effort <effort>]] [--provider-timeout-ms <ms>] [--json] | roadmap decision <project> [--request-proposal --provider openclaw_agent|anthropic_api [--provider-model <model> [--provider-effort <effort>]] [--provider-timeout-ms <ms>]] [--json]",
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
    failOption(
      json,
      "missing_candidate_value",
      "Missing value for --candidate",
    );
  }
  if (
    candidateId !== undefined &&
    mode !== "plan" &&
    mode !== "execute" &&
    mode !== "publish"
  ) {
    failOption(
      json,
      "candidate_plan_or_execute_only",
      "--candidate is only supported in plan, execute or publish mode.",
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
  if (
    progressEvents &&
    ((mode !== "execute" && mode !== "publish") || !json)
  ) {
    failOption(
      json,
      "progress_events_execute_json_only",
      "--progress-events requires execute or publish mode with --json.",
    );
  }

  if (providerId !== undefined && providerExecutable === undefined) {
    failOption(
      json,
      "missing_provider_executable",
      `${providerLabel(providerId)} provider requires --provider-executable.`,
    );
  }

  let runApplication: LoopApplicationAssembly = application;
  if (providerId !== undefined && providerExecutable !== undefined) {
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
} else if (command === "runs") {
  const project = resolveProjectOrExit("runs");
  const json = process.argv.includes("--json");
  const limitValue = optionValue("--limit");
  const runId = optionValue("--run-id");
  if (hasOption("--limit") && limitValue === undefined) {
    failOption(
      json,
      "missing_run_history_limit_value",
      "Missing value for --limit",
    );
  }
  if (hasOption("--run-id") && runId === undefined) {
    failOption(json, "missing_run_history_run_id", "Missing value for --run-id");
  }
  if (runId !== undefined && limitValue !== undefined) {
    failOption(
      json,
      "run_history_lookup_with_limit",
      "--run-id cannot be combined with --limit.",
    );
  }
  const limit =
    limitValue === undefined ? undefined : Number.parseInt(limitValue, 10);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    failOption(
      json,
      "invalid_run_history_limit",
      `Invalid --limit value: ${limitValue}`,
    );
  }
  if (runId !== undefined) {
    const exitCode = printRunHistoryLookup(application, project.name, runId, json);
    if (exitCode !== 0) process.exitCode = exitCode;
  } else {
    printRunHistory(application, project.name, {
      ...(json ? { json } : {}),
      ...(limit !== undefined ? { limit } : {}),
    });
  }
} else if (command === "candidate" && process.argv[3] === "review") {
  const project = resolveProjectOrExit("candidate review", 4);
  const json = process.argv.includes("--json");
  const runId = optionValue("--run-id");
  if (hasOption("--run-id") && runId === undefined) {
    failOption(json, "missing_candidate_run_id", "Missing value for --run-id");
  }
  if (runId === undefined) {
    failOption(
      json,
      "missing_candidate_run_id",
      "Candidate review requires --run-id.",
    );
  }
  const exitCode = await printCandidatePublicationReview(
    application,
    project.name,
    runId,
    json,
  );
  if (exitCode !== 0) process.exitCode = exitCode;
} else {
  terminal.error(
    "Usage: pnpm loop help|summary|status|doctor|roadmap status|overview|objective|proposal-context <project>|context <project>|validate <project>|review <project>|next <project>|prompt <project>|run <project>|runs <project> [--limit N | --run-id <runId>]|candidate review <project> --run-id <runId>",
  );
  process.exit(1);
}
