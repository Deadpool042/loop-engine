import type {
  LoopApplicationAssembly,
  LoopApplicationProject,
  LoopApplicationRunMode,
  LoopProviderId,
} from "../composition/index.js";
import { terminal } from "../ui/terminal.js";
import { printJsonError } from "./json-error.js";

export function isLoopRunMode(
  application: LoopApplicationAssembly,
  value: string,
): value is LoopApplicationRunMode {
  return (application.loopRunModes as readonly string[]).includes(value);
}

function formatBudgetValue(value: number | null | undefined): string {
  return value == null ? "unbounded" : String(value);
}

function printLoopRunResult(
  result: Awaited<ReturnType<LoopApplicationAssembly["runLoopExecute"]>>,
): void {
  terminal.header(`Run • ${result.project}`);
  terminal.info(`Run id: ${result.runId}`);
  terminal.info(`Mode: ${result.mode}`);
  terminal.info(`Status: ${result.status}`);
  terminal.section("Candidate");
  if (result.candidate) {
    terminal.info(`Kind: ${result.candidate.kind}`);
    terminal.info(result.candidate.text);
  } else terminal.warning("No roadmap candidate selected.");

  terminal.section("Cycle steps");
  for (const step of result.steps) {
    terminal.info(`${step.name}: ${step.status}`);
    for (const detail of step.details) terminal.info(`  ${detail}`);
  }

  terminal.section(
    result.mode === "plan" ? "Agent policy (forecast)" : "Agent policy",
  );
  if (result.agentPolicy) {
    const policy = result.agentPolicy;
    terminal.info(`Status: ${policy.status}`);
    terminal.info(`Task category: ${policy.requirements.category}`);
    terminal.info(`Invocation effort: ${policy.requirements.minimumEffort}`);

    if (policy.selection?.outcome === "selected") {
      const profile = policy.selection.profile;
      terminal.info(`Selected: ${profile.id}`);
      terminal.info(`Runtime: ${profile.runtime}`);
      terminal.info(`Provider: ${profile.provider}`);
      terminal.info(`Model: ${profile.model}`);
      terminal.info(`Profile ranking effort: ${profile.effort}`);
      const alternatives = policy.selection.notSelected ?? [];
      if (alternatives.length > 0) {
        terminal.info(
          `Other eligible profiles: ${alternatives
            .slice(0, 3)
            .map((candidate) => `${candidate.profileId} (${candidate.reason})`)
            .join(", ")}${alternatives.length > 3 ? " …" : ""}`,
        );
      }
    } else if (policy.selection?.outcome === "no_match") {
      terminal.warning("Selection: no compatible agent.");
    } else {
      terminal.info("Selection: not attempted.");
    }

    const budget = policy.selectionRequest.budgetCeiling;
    if (budget) {
      terminal.info(
        `Budget ceiling: tokens=${formatBudgetValue(budget.maxTokens)}, costUsd=${formatBudgetValue(budget.maxCostUsd)}, durationMs=${formatBudgetValue(budget.maxDurationMs)}, calls=${formatBudgetValue(budget.maxCalls)}, repairs=${formatBudgetValue(budget.maxRepairs)}`,
      );
    }

    if (policy.fallback.active) {
      terminal.warning(
        `Fallback: ${policy.fallback.reason ?? "active without a declared reason"}`,
      );
    }

    for (const reason of policy.reasons) {
      terminal.info(`Reason: ${reason}`);
    }

    if (result.mode === "plan") {
      terminal.info("Execution: forecast only; no agent was called.");
    }
  } else if (result.mode === "plan") {
    terminal.info("No agent was called.");
  } else {
    terminal.info("No agent policy resolution available.");
  }

  terminal.section("Validation");
  if (result.validation) {
    terminal.info(`Status: ${result.validation.status}`);
    terminal.info(`Attempts: ${result.validation.attempts}`);
    terminal.info(`Repair attempts: ${result.validation.repairAttempts}`);
  } else terminal.info("No validation executed.");

  terminal.section("Worktree");
  if (result.modifiedFiles.length === 0)
    terminal.info("No modified file reported.");
  else for (const file of result.modifiedFiles) terminal.info(file);
  terminal.info(
    result.commit ? `Commit: ${result.commit.sha}` : "Commit: not performed.",
  );
  if (result.patchExport) {
    terminal.info(
      `Patch export: ${result.patchExport.path} (${result.patchExport.fileCount} files, sha256 ${result.patchExport.sha256})`,
    );
  }
  terminal.info("Publication: not performed.");

  if (result.failure) {
    terminal.section("Failure");
    terminal.error(`${result.failure.code}: ${result.failure.message}`);
  }
}

export type RunLoopRunCommandOptions = Readonly<{
  candidateId?: string;
  maxRepairs?: number;
  provider?: LoopProviderId;
  commitMessage?: string;
  exportPatchPath?: string;
  onProgress?: (event: Readonly<{ status: string }>) => void;
}>;

function printCommandError(
  json: boolean,
  code: Parameters<typeof printJsonError>[0],
  message: string,
): number {
  if (json) printJsonError(code, message);
  else terminal.error(message);
  return 1;
}

export async function runLoopRunCommand(
  application: LoopApplicationAssembly,
  project: LoopApplicationProject,
  mode: LoopApplicationRunMode,
  json: boolean,
  options: RunLoopRunCommandOptions = {},
): Promise<number> {
  if (mode === "publish") {
    return printCommandError(
      json,
      "mode_not_implemented",
      "Loop run mode not implemented: publish",
    );
  }

  if (
    options.candidateId !== undefined &&
    mode !== "plan" &&
    mode !== "execute"
  ) {
    return printCommandError(
      json,
      "candidate_plan_or_execute_only",
      "--candidate is only supported in plan or execute mode.",
    );
  }

  if (options.provider !== undefined && !application.loopExecutor) {
    const label = options.provider === "claude_code" ? "Claude Code" : "Codex";
    return printCommandError(
      json,
      "missing_provider_executable",
      `${label} provider requires --provider-executable.`,
    );
  }

  if (
    application.loopExecutor !== undefined &&
    application.loopAgentRegistry === undefined
  ) {
    return printCommandError(
      json,
      "agent_policy_rejected",
      "The configured provider has no bound agent registry.",
    );
  }

  const executionDependencies = {
    ...(application.loopExecutor ? { executor: application.loopExecutor } : {}),
    ...(application.loopAgentRegistry
      ? { agentRegistry: application.loopAgentRegistry }
      : {}),
  };
  const { runLoopCommit, runLoopExecute, runLoopPlan } = application;
  let result: Awaited<ReturnType<typeof runLoopExecute>>;
  if (mode === "plan") {
    result = runLoopPlan(project.name, {
      ...(options.candidateId === undefined
        ? {}
        : { candidateId: options.candidateId }),
    });
  } else if (mode === "execute") {
    const retainUntilCleanup = (): void => undefined;
    const retainOnSigterm =
      options.onProgress !== undefined && process.platform !== "win32";
    if (retainOnSigterm) {
      // The desktop invoker signals the dedicated execution process group.
      // Handling SIGTERM here lets provider descendants terminate while this
      // Loop Engine process remains alive for workspace/lock finally cleanup.
      process.on("SIGTERM", retainUntilCleanup);
    }
    try {
      result = await runLoopExecute(project.name, {
        ...(options.candidateId === undefined
          ? {}
          : { candidateId: options.candidateId }),
        maxRepairs: options.maxRepairs ?? 0,
        ...(options.exportPatchPath === undefined
          ? {}
          : { exportPatchPath: options.exportPatchPath }),
        ...(options.onProgress === undefined
          ? {}
          : { onProgress: options.onProgress }),
        ...executionDependencies,
      });
    } finally {
      if (retainOnSigterm) process.off("SIGTERM", retainUntilCleanup);
    }
  } else {
    if (!options.commitMessage) {
      return printCommandError(
        json,
        "missing_commit_message",
        "Commit mode requires --commit-message.",
      );
    }
    result = await runLoopCommit(project.name, {
      maxRepairs: options.maxRepairs ?? 0,
      commitMessage: options.commitMessage,
      ...executionDependencies,
    });
  }

  const historyOutcome = application.recordLoopRunHistory(result);
  if (!historyOutcome.ok) {
    const detail = {
      code: historyOutcome.code ?? "write_failed",
      message: historyOutcome.message ?? "Run history write failed.",
    };
    if (json) {
      process.stderr.write(
        `LOOP_RUN_HISTORY_WRITE_FAILED:${JSON.stringify(detail)}\n`,
      );
    } else {
      terminal.warning(
        `Run history not recorded: ${detail.code} — ${detail.message}`,
      );
    }
  }

  if (json) {
    console.log(JSON.stringify(application.generateExecutionReport(result)));
  } else printLoopRunResult(result);
  return result.status === "failed" ? 1 : 0;
}
