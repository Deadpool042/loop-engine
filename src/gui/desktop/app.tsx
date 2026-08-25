import { useEffect, useRef, useState } from "react";
import { Button } from "./components/ui/button.js";
import {
  formatCandidateState,
  formatCandidateTitle,
} from "./candidate-display.js";
import { parseContextDetail, type ContextDetail } from "./context-contract.js";
import { formatGitStatus, getPlanningDisplay } from "./planning-display.js";
import { parseReviewDetail, type ReviewDetail } from "./review-contract.js";
import {
  formatPlanSteps,
  hasAddressableCandidate,
  isPlanForSelectedProject,
  parsePlanDetail,
  parsePlanFailure,
  type PlanDetail,
} from "./plan-contract.js";
import type { DesktopExecuteProvider } from "./execute-handler.js";
import type { DesktopExecutionSession } from "./execution-session.js";
import {
  buildGuidedFlowSteps,
  getFocusedGuidedFlowStepId,
} from "./guided-flow.js";
import {
  parseSummaryResponse,
  type SummaryProject,
  type SummaryWorkAvailabilityReason,
} from "./summary-contract.js";
import {
  parseRoadmapProposalReport,
  type RoadmapProposalProfileOverride,
  type RoadmapProposalReport,
} from "./roadmap-proposal-contract.js";
import {
  parseRoadmapProposalEstimateReport,
  type RoadmapProposalEstimateOption,
  type RoadmapProposalEstimateReport,
} from "./roadmap-proposal-estimate-contract.js";
import type { CliInvocationResult } from "../cli-invoker.js";
import {
  formatExecutionResultStatus,
  formatExecutionValidationStatus,
  parseExecutionResultDetail,
  type ExecutionResultDetail,
} from "./execution-result-contract.js";
import {
  formatRunHistoryStatus,
  parseRunHistoryDetail,
  type RunHistoryDetail,
  type RunHistoryEntry,
} from "./run-history-contract.js";
import {
  parseGateReassessmentReport,
  type GateReassessmentReport,
} from "./gate-reassessment-contract.js";
import type {
  DesktopExecutionDecisionDraft,
  DesktopExecutionDecisionResult,
} from "./execution-decision-contract.js";
import type { PatchReviewFile, PatchReviewResult } from "./patch-review.js";

const RENEWABLE_DECISION_MESSAGES: Readonly<Record<string, string>> = {
  decision_missing:
    "Aucune décision d’exécution valide n’est disponible pour ce travail.",
  sha_stale: "Le projet a changé depuis la dernière autorisation.",
  decision_revalidation_required:
    "Cette décision doit être revue avant toute exécution.",
  candidate_authorization_mismatch:
    "Le candidat ne correspond plus à la décision autorisée.",
  decision_draft_serialize_failed:
    "Ce brouillon ne peut pas être sérialisé. Préparez une nouvelle décision.",
};
export function executionDecisionRenewalMessage(code: unknown): string | null {
  return typeof code === "string"
    ? (RENEWABLE_DECISION_MESSAGES[code] ?? null)
    : null;
}
export function clearResolvedShaStalePlanError(
  error: string | null,
): string | null {
  return error?.startsWith("sha_stale:") ? null : error;
}
const DRAFT_CLEARING_APPROVE_FAILURE_CODES = new Set([
  "decision_draft_stale",
  "decision_draft_serialize_failed",
]);
export function shouldClearDraftOnApproveFailure(code: unknown): boolean {
  return (
    typeof code === "string" && DRAFT_CLEARING_APPROVE_FAILURE_CODES.has(code)
  );
}

export function getDisplayedAgentRoutingReasons(
  reasons: readonly string[],
): readonly string[] {
  return reasons.slice(0, 3);
}

export function canCancelExecution(
  session: Pick<DesktopExecutionSession, "result"> | null,
): boolean {
  return session !== null && session.result === null;
}

const WORK_AVAILABILITY_REASON_LABELS: Readonly<
  Record<SummaryWorkAvailabilityReason, string>
> = {
  roadmap_configured: "Candidat admissible disponible",
  connect_discovered_roadmap: "Roadmap détectée mais non configurée",
  no_roadmap_present: "Aucune roadmap disponible",
  maintenance_no_work: "Aucun travail prévu en maintenance",
  deferred_no_work: "Travail roadmap différé",
  external_planning_source: "Planning géré par une source externe",
  no_admissible_candidate: "Aucun candidat roadmap admissible",
};

export function formatWorkAvailability(project: SummaryProject): string {
  const availability = project.workAvailability;
  if (availability === undefined) return "Disponibilité inconnue";
  return availability.actionable
    ? "Travail actionnable"
    : WORK_AVAILABILITY_REASON_LABELS[availability.reason];
}

export function formatLastRun(project: SummaryProject): string {
  if (project.lastRun === undefined) return "Historique indisponible";
  if (project.lastRun === null) return "Aucun run enregistré";
  const status =
    {
      completed: "terminé",
      blocked: "bloqué",
      failed: "échec",
      cancelled: "annulé",
    }[project.lastRun.status] ?? project.lastRun.status;
  return project.lastRun.completedAt === null
    ? `Dernier run : ${status}`
    : `Dernier run : ${status} · ${project.lastRun.completedAt}`;
}

const ROADMAP_PROPOSAL_PROFILE_LABELS: Readonly<Record<string, string>> = {
  economy: "Économique",
  balanced: "Équilibré",
  deep: "Approfondi",
};

const healthTone = {
  good: "bg-emerald-500",
  warning: "bg-amber-400",
  error: "bg-rose-500",
} as const;

function HealthMark({
  health,
}: Pick<SummaryProject, "health">): React.JSX.Element {
  return (
    <span className="flex items-center gap-2 text-xs font-medium text-loop-muted">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${healthTone[health]}`}
      />
      {health}
    </span>
  );
}

export function startExecutionSessionPolling(options: {
  sessionId: string;
  fetchSession: (sessionId: string) => Promise<DesktopExecutionSession | null>;
  onSession: (session: DesktopExecutionSession) => void;
  setIntervalFn?: (callback: () => void, delayMs: number) => number;
  clearIntervalFn?: (timer: number) => void;
}): () => void {
  const setIntervalFn = options.setIntervalFn ?? window.setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? window.clearInterval;
  let active = true;
  let polling = false;
  const poll = async (): Promise<void> => {
    if (polling || !active) return;
    polling = true;
    try {
      const current = await options.fetchSession(options.sessionId);
      if (!active || current === null) return;
      options.onSession(current);
      if (current.result !== null) {
        active = false;
        clearIntervalFn(timer);
      }
    } finally {
      polling = false;
    }
  };
  const timer = setIntervalFn(() => {
    void poll();
  }, 750);
  return () => {
    active = false;
    clearIntervalFn(timer);
  };
}

export type RoadmapProposalOutcome =
  | Readonly<{ ok: true; report: RoadmapProposalReport }>
  | Readonly<{ ok: false; message: string }>;

export function shouldDisplayRoadmapProposalResult(
  resultProjectName: string,
  currentSelectedProjectName: string | null,
): boolean {
  return resultProjectName === currentSelectedProjectName;
}

type AvailableRoadmapProposalEstimate = Extract<
  RoadmapProposalEstimateReport["estimate"],
  { status: "available" }
>;

/** Selects a precomputed local option only; it never invokes IPC. */
export function selectRoadmapProposalEstimate(
  estimate: AvailableRoadmapProposalEstimate,
  profileOverride: RoadmapProposalProfileOverride,
): RoadmapProposalEstimateOption | null {
  const profile =
    profileOverride === "auto" ? estimate.profile : profileOverride;
  return estimate.options.find((option) => option.profile === profile) ?? null;
}

export function createRoadmapProposalRunner(options: {
  invoke: (
    projectName: string,
    profileOverride: RoadmapProposalProfileOverride,
  ) => Promise<CliInvocationResult>;
  onStart: (projectName: string) => void;
  onResult: (projectName: string, result: RoadmapProposalOutcome) => void;
}): {
  start: (
    projectName: string,
    profileOverride: RoadmapProposalProfileOverride,
  ) => Promise<void>;
  isActive: () => boolean;
} {
  let active = false;

  return Object.freeze({
    isActive() {
      return active;
    },
    async start(
      projectName: string,
      profileOverride: RoadmapProposalProfileOverride,
    ): Promise<void> {
      if (active) return;
      active = true;
      options.onStart(projectName);

      try {
        const result = await options.invoke(projectName, profileOverride);
        if (!result.ok) {
          options.onResult(projectName, { ok: false, message: result.raw });
          return;
        }

        const report = parseRoadmapProposalReport(result.json);
        if (report === null) {
          options.onResult(projectName, {
            ok: false,
            message:
              "La réponse roadmap propose ne respecte pas le contrat JSON attendu.",
          });
          return;
        }

        options.onResult(projectName, { ok: true, report });
      } catch {
        options.onResult(projectName, {
          ok: false,
          message: "Impossible d’analyser la suite.",
        });
      } finally {
        active = false;
      }
    },
  });
}

export type RoadmapProposalEstimateOutcome =
  | Readonly<{ ok: true; report: RoadmapProposalEstimateReport }>
  | Readonly<{ ok: false; message: string }>;

export function createRoadmapProposalEstimateRunner(options: {
  invoke: (projectName: string) => Promise<CliInvocationResult>;
  onStart: (projectName: string) => void;
  onResult: (
    projectName: string,
    result: RoadmapProposalEstimateOutcome,
  ) => void;
}): { start: (projectName: string) => Promise<void> } {
  return Object.freeze({
    async start(projectName: string): Promise<void> {
      options.onStart(projectName);
      try {
        const result = await options.invoke(projectName);
        if (!result.ok) {
          options.onResult(projectName, { ok: false, message: result.raw });
          return;
        }
        const report = parseRoadmapProposalEstimateReport(result.json);
        if (report === null) {
          options.onResult(projectName, {
            ok: false,
            message:
              "La réponse roadmap propose-estimate ne respecte pas le contrat JSON attendu.",
          });
          return;
        }
        options.onResult(projectName, { ok: true, report });
      } catch {
        options.onResult(projectName, {
          ok: false,
          message: "Impossible d’estimer le coût de l’analyse.",
        });
      }
    },
  });
}

function PatchDiff({ file }: { file: PatchReviewFile }): React.JSX.Element {
  return (
    <div
      className="patch-diff rounded border border-loop-line font-mono text-xs"
      tabIndex={0}
    >
      {file.hunks.length === 0 ? (
        <p className="p-3 text-loop-muted">Aucun contenu textuel à afficher.</p>
      ) : (
        file.hunks.map((hunk) => (
          <div key={hunk.header}>
            <p className="m-0 border-y border-loop-line bg-loop-paper px-3 py-1 text-loop-muted">
              {hunk.header}
            </p>
            {hunk.lines.map((line, index) => (
              <div
                key={`${index}:${line.content}`}
                className={`grid grid-cols-[3rem_3rem_1.25rem_minmax(0,1fr)] px-2 ${line.type === "addition" ? "bg-emerald-50" : line.type === "deletion" ? "bg-rose-50" : ""}`}
              >
                <span>{line.oldLineNumber ?? ""}</span>
                <span>{line.newLineNumber ?? ""}</span>
                <span>
                  {line.type === "addition"
                    ? "+"
                    : line.type === "deletion"
                      ? "-"
                      : line.type === "no_newline"
                        ? "\\"
                        : " "}
                </span>
                <span className="whitespace-pre">{line.content}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

export function App(): React.JSX.Element {
  const [projects, setProjects] = useState<readonly SummaryProject[]>([]);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [contextDetail, setContextDetail] = useState<ContextDetail | null>(
    null,
  );
  const [contextError, setContextError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [reviewDetail, setReviewDetail] = useState<ReviewDetail | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [runHistory, setRunHistory] = useState<RunHistoryDetail | null>(null);
  const [runHistoryProjectName, setRunHistoryProjectName] = useState<
    string | null
  >(null);
  const [runHistoryError, setRunHistoryError] = useState<string | null>(null);
  const [runHistoryLoading, setRunHistoryLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [planDetail, setPlanDetail] = useState<PlanDetail | null>(null);
  const [planProjectName, setPlanProjectName] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [decisionRenewalCode, setDecisionRenewalCode] = useState<string | null>(
    null,
  );
  const [decisionDraft, setDecisionDraft] =
    useState<DesktopExecutionDecisionDraft | null>(null);
  const [decisionPrepareLoading, setDecisionPrepareLoading] = useState(false);
  const [decisionApproveLoading, setDecisionApproveLoading] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionProviderDetails, setDecisionProviderDetails] =
    useState<
      Extract<DesktopExecutionDecisionResult, { ok: false }>["provider"]
    >();
  const [executeProvider, setExecuteProvider] =
    useState<DesktopExecuteProvider>("claude_code");
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeMessage, setExecuteMessage] = useState<string | null>(null);
  const [executeResult, setExecuteResult] =
    useState<ExecutionResultDetail | null>(null);
  const [executionSession, setExecutionSession] =
    useState<DesktopExecutionSession | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [patchReview, setPatchReview] = useState<PatchReviewResult | null>(
    null,
  );
  const [patchReviewLoading, setPatchReviewLoading] = useState(false);
  const [selectedPatchFile, setSelectedPatchFile] = useState(0);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalProfileSelection, setProposalProfileSelection] =
    useState<RoadmapProposalProfileOverride>("auto");
  const [proposalReport, setProposalReport] =
    useState<RoadmapProposalReport | null>(null);
  const [proposalProjectName, setProposalProjectName] = useState<string | null>(
    null,
  );
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [proposalEstimateReport, setProposalEstimateReport] =
    useState<RoadmapProposalEstimateReport | null>(null);
  const [proposalEstimateProjectName, setProposalEstimateProjectName] =
    useState<string | null>(null);
  const [proposalEstimateError, setProposalEstimateError] = useState<
    string | null
  >(null);
  const [gateReassessmentReport, setGateReassessmentReport] =
    useState<GateReassessmentReport | null>(null);
  const [gateReassessmentProjectName, setGateReassessmentProjectName] =
    useState<string | null>(null);
  const [gateReassessmentLoading, setGateReassessmentLoading] = useState(false);
  const planRequestId = useRef(0);
  const decisionRequestId = useRef(0);
  const selectedProject =
    projects.find((project) => project.project.name === selectedProjectName) ??
    null;
  const selectedCandidate = contextDetail?.roadmap.selectedCandidate ?? null;
  const selectedRun =
    runHistoryProjectName === selectedProjectName
      ? (runHistory?.entries.find((entry) => entry.runId === selectedRunId) ??
        null)
      : null;
  const planningDisplay =
    contextDetail === null ? null : getPlanningDisplay(contextDetail);
  const availableProposalEstimate =
    proposalEstimateReport !== null &&
    proposalEstimateProjectName === selectedProjectName &&
    proposalEstimateReport.estimate.status === "available"
      ? proposalEstimateReport.estimate
      : null;
  const selectedProposalEstimate =
    availableProposalEstimate === null
      ? null
      : selectRoadmapProposalEstimate(
          availableProposalEstimate,
          proposalProfileSelection,
        );
  const guidedFlowSteps = buildGuidedFlowSteps({
    hasProject: selectedProject !== null,
    contextLoading,
    hasCandidate: selectedCandidate !== null,
    candidateAddressable: hasAddressableCandidate(selectedCandidate),
    planLoading,
    hasPlan:
      planDetail !== null &&
      isPlanForSelectedProject(planProjectName, selectedProjectName),
    hasPlanError: planError !== null,
    hasExecutionOutcome: executeResult !== null || executeMessage !== null,
    hasExecutionDecisionInProgress:
      decisionDraft !== null || decisionRenewalCode !== null,
  });
  const focusedStepId = getFocusedGuidedFlowStepId(guidedFlowSteps);
  const selectedPatchReviewFile =
    patchReview?.status === "ready"
      ? (patchReview.files[selectedPatchFile] ?? null)
      : null;

  useEffect(() => {
    void refreshSummary();
  }, []);

  useEffect(() => {
    if (selectedProjectName === null) {
      setContextDetail(null);
      setContextError(null);
      setContextLoading(false);
      return;
    }

    let active = true;
    setContextDetail(null);
    setContextError(null);
    setContextLoading(true);

    void window.loopDesktop
      .context(selectedProjectName)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setContextError(result.raw);
          return;
        }

        const detail = parseContextDetail(result.json);
        if (detail === null) {
          setContextError(
            "La réponse context ne respecte pas le contrat JSON attendu.",
          );
          return;
        }

        setContextDetail(detail);
      })
      .finally(() => {
        if (active) setContextLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProjectName]);

  useEffect(() => {
    if (selectedProjectName === null) {
      setRunHistory(null);
      setRunHistoryProjectName(null);
      setRunHistoryError(null);
      setRunHistoryLoading(false);
      setSelectedRunId(null);
      return;
    }
    const projectName = selectedProjectName;
    let active = true;
    setRunHistory(null);
    setRunHistoryProjectName(null);
    setRunHistoryError(null);
    setRunHistoryLoading(true);
    setSelectedRunId(null);
    void window.loopDesktop
      .runs(projectName)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setRunHistoryError(result.raw);
          return;
        }
        const detail = parseRunHistoryDetail(result.json);
        if (detail === null || detail.project !== projectName) {
          setRunHistoryError(
            "La réponse runs ne respecte pas le contrat JSON attendu.",
          );
          return;
        }
        setRunHistory(detail);
        setRunHistoryProjectName(projectName);
        setSelectedRunId(detail.entries[0]?.runId ?? null);
      })
      .finally(() => {
        if (active) setRunHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedProjectName]);

  const selectedProjectNameRef = useRef<string | null>(selectedProjectName);
  selectedProjectNameRef.current = selectedProjectName;

  const proposalRunner = useRef(
    createRoadmapProposalRunner({
      invoke: (projectName, profileOverride) =>
        window.loopDesktop.roadmapProposal(projectName, profileOverride),
      onStart(projectName) {
        if (
          !shouldDisplayRoadmapProposalResult(
            projectName,
            selectedProjectNameRef.current,
          )
        )
          return;
        setProposalReport(null);
        setProposalProjectName(null);
        setProposalError(null);
        setProposalLoading(true);
      },
      onResult(projectName, result) {
        setProposalLoading(false);
        if (
          !shouldDisplayRoadmapProposalResult(
            projectName,
            selectedProjectNameRef.current,
          )
        )
          return;
        if (result.ok) {
          setProposalReport(result.report);
          setProposalProjectName(projectName);
        } else {
          setProposalError(result.message);
        }
      },
    }),
  ).current;

  const proposalEstimateRunner = useRef(
    createRoadmapProposalEstimateRunner({
      invoke: (projectName) =>
        window.loopDesktop.roadmapProposalEstimate(projectName),
      onStart(projectName) {
        if (
          !shouldDisplayRoadmapProposalResult(
            projectName,
            selectedProjectNameRef.current,
          )
        )
          return;
        setProposalEstimateReport(null);
        setProposalEstimateProjectName(null);
        setProposalEstimateError(null);
      },
      onResult(projectName, result) {
        if (
          !shouldDisplayRoadmapProposalResult(
            projectName,
            selectedProjectNameRef.current,
          )
        )
          return;
        if (result.ok) {
          setProposalEstimateReport(result.report);
          setProposalEstimateProjectName(projectName);
        } else {
          setProposalEstimateError(result.message);
        }
      },
    }),
  ).current;

  useEffect(() => {
    planRequestId.current += 1;
    setPlanDetail(null);
    setPlanProjectName(null);
    setPlanError(null);
    setPlanLoading(false);
    decisionRequestId.current += 1;
    setDecisionRenewalCode(null);
    setDecisionDraft(null);
    setDecisionPrepareLoading(false);
    setDecisionApproveLoading(false);
    setDecisionError(null);
    setDecisionProviderDetails(undefined);
    setProposalReport(null);
    setProposalProjectName(null);
    setProposalError(null);
    setProposalLoading(proposalRunner.isActive());
    setProposalProfileSelection("auto");
    setProposalEstimateReport(null);
    setProposalEstimateProjectName(null);
    setProposalEstimateError(null);
  }, [selectedProjectName]);

  useEffect(() => {
    if (selectedProjectName === null) return;
    if (!planningDisplay?.showRoadmapProposalAction) return;
    if (proposalEstimateProjectName === selectedProjectName) return;
    if (proposalEstimateError !== null) return;
    void proposalEstimateRunner.start(selectedProjectName);
  }, [
    selectedProjectName,
    planningDisplay?.showRoadmapProposalAction,
    proposalEstimateProjectName,
    proposalEstimateError,
  ]);

  useEffect(() => {
    if (
      selectedProjectName === null ||
      !planningDisplay?.showGateReassessmentAction
    )
      return;
    if (
      proposalEstimateProjectName === selectedProjectName ||
      proposalEstimateError !== null
    )
      return;
    const projectName = selectedProjectName;
    void window.loopDesktop
      .gateReassessmentEstimate(projectName)
      .then((result) => {
        if (
          !result.ok ||
          !shouldDisplayRoadmapProposalResult(
            projectName,
            selectedProjectNameRef.current,
          )
        )
          return;
        const report = parseRoadmapProposalEstimateReport(result.json);
        if (report !== null) {
          setProposalEstimateReport(report);
          setProposalEstimateProjectName(projectName);
        }
      });
  }, [
    selectedProjectName,
    planningDisplay?.showGateReassessmentAction,
    proposalEstimateProjectName,
    proposalEstimateError,
  ]);

  function selectProject(projectName: string): void {
    planRequestId.current += 1;
    setPlanDetail(null);
    setPlanProjectName(null);
    setPlanError(null);
    setPlanLoading(false);
    setProposalReport(null);
    setProposalProjectName(null);
    setProposalError(null);
    setProposalLoading(proposalRunner.isActive());
    decisionRequestId.current += 1;
    setDecisionRenewalCode(null);
    setDecisionDraft(null);
    setDecisionPrepareLoading(false);
    setDecisionApproveLoading(false);
    setDecisionError(null);
    setDecisionProviderDetails(undefined);
    setSelectedProjectName(projectName);
  }

  function analyzeRoadmapContinuation(): void {
    if (selectedProjectName === null) return;
    void proposalRunner.start(selectedProjectName, proposalProfileSelection);
  }
  function reassessGates(): void {
    if (selectedProjectName === null || gateReassessmentLoading) return;
    const projectName = selectedProjectName;
    setGateReassessmentLoading(true);
    setGateReassessmentReport(null);
    setGateReassessmentProjectName(null);
    void window.loopDesktop
      .gateReassessment(projectName, proposalProfileSelection)
      .then((result) => {
        if (
          !shouldDisplayRoadmapProposalResult(
            projectName,
            selectedProjectNameRef.current,
          ) ||
          !result.ok
        )
          return;
        const report = parseGateReassessmentReport(result.json);
        if (report !== null) {
          setGateReassessmentReport(report);
          setGateReassessmentProjectName(projectName);
        }
      })
      .finally(() => setGateReassessmentLoading(false));
  }

  function selectProposalProfile(value: string): void {
    if (
      value === "auto" ||
      value === "economy" ||
      value === "balanced" ||
      value === "deep"
    ) {
      setProposalProfileSelection(value);
    }
  }

  async function preparePlan(): Promise<void> {
    const candidate = contextDetail?.roadmap.selectedCandidate;
    if (selectedProjectName === null || !hasAddressableCandidate(candidate))
      return;

    const projectName = selectedProjectName;
    const candidateId = candidate.id;
    const requestId = planRequestId.current + 1;
    planRequestId.current = requestId;
    setPlanDetail(null);
    setPlanProjectName(null);
    setPlanError(null);
    setDecisionRenewalCode(null);
    setPlanLoading(true);

    try {
      const result = await window.loopDesktop.plan(projectName, candidateId);
      if (requestId !== planRequestId.current) return;
      if (!result.ok) {
        setPlanError(result.raw);
        return;
      }

      const failure = parsePlanFailure(result.json);
      if (failure) {
        setPlanError(`${failure.code}: ${failure.message}`);
        setDecisionRenewalCode(
          executionDecisionRenewalMessage(failure.code) ? failure.code : null,
        );
        return;
      }

      const plan = parsePlanDetail(result.json);
      if (plan === null) {
        setPlanError(
          "La réponse plan ne respecte pas le contrat JSON attendu.",
        );
        return;
      }
      if (plan.project !== projectName || plan.candidate.id !== candidateId) {
        setPlanError("Le plan retourné ne correspond pas au candidat demandé.");
        return;
      }

      setPlanDetail(plan);
      setPlanProjectName(projectName);
      if (plan.profile?.provider === "openai") setExecuteProvider("codex");
      if (plan.profile?.provider === "anthropic")
        setExecuteProvider("claude_code");
    } catch {
      if (requestId === planRequestId.current) {
        setPlanError("Impossible de préparer le plan.");
      }
    } finally {
      if (requestId === planRequestId.current) setPlanLoading(false);
    }
  }

  async function prepareExecutionDecision(): Promise<void> {
    if (selectedProjectName === null || decisionPrepareLoading) return;
    const projectName = selectedProjectName;
    const candidateId = selectedCandidate?.id ?? null;
    const requestId = decisionRequestId.current + 1;
    decisionRequestId.current = requestId;
    setDecisionPrepareLoading(true);
    setDecisionError(null);
    setDecisionProviderDetails(undefined);
    setDecisionDraft(null);
    try {
      const result =
        await window.loopDesktop.prepareExecutionDecision(projectName);
      if (
        requestId !== decisionRequestId.current ||
        selectedProjectNameRef.current !== projectName ||
        (selectedCandidate?.id ?? null) !== candidateId
      )
        return;
      if (!result.ok || !("draftId" in result)) {
        setDecisionError(
          !result.ok ? result.message : "Le brouillon est invalide.",
        );
        if (!result.ok) setDecisionProviderDetails(result.provider);
        return;
      }
      const { ok: _ok, ...draft } = result;
      setPlanError((error) => clearResolvedShaStalePlanError(error));
      setDecisionRenewalCode(null);
      setDecisionDraft(draft);
    } catch {
      if (requestId === decisionRequestId.current)
        setDecisionError("Impossible de préparer la décision.");
    } finally {
      if (requestId === decisionRequestId.current)
        setDecisionPrepareLoading(false);
    }
  }

  async function refreshApprovedProjectContext(
    projectName: string,
    candidateId: string | null,
  ): Promise<boolean> {
    try {
      const result = await window.loopDesktop.context(projectName);
      if (!result.ok) return false;
      const detail = parseContextDetail(result.json);
      if (
        detail === null ||
        detail.roadmap.selectedCandidate?.id !== candidateId
      )
        return false;
      setContextDetail(detail);
      return true;
    } catch {
      return false;
    }
  }

  async function approveExecutionDecision(): Promise<void> {
    if (decisionDraft === null || decisionApproveLoading) return;
    const projectName = selectedProjectName;
    const candidateId = selectedCandidate?.id ?? null;
    const draftId = decisionDraft.draftId;
    const requestId = decisionRequestId.current + 1;
    decisionRequestId.current = requestId;
    setDecisionApproveLoading(true);
    setDecisionError(null);
    try {
      const result = await window.loopDesktop.approveExecutionDecision(draftId);
      if (
        requestId !== decisionRequestId.current ||
        selectedProjectNameRef.current !== projectName ||
        (selectedCandidate?.id ?? null) !== candidateId
      )
        return;
      if (!result.ok) {
        setDecisionError(result.message);
        if (shouldClearDraftOnApproveFailure(result.code)) {
          setDecisionDraft(null);
          setDecisionRenewalCode(
            result.code === "decision_draft_stale" ? "sha_stale" : result.code,
          );
        }
        return;
      }
      setDecisionDraft(null);
      setDecisionRenewalCode(null);
      setDecisionError(null);
      if (!(await refreshApprovedProjectContext(projectName!, candidateId))) {
        setDecisionRenewalCode("sha_stale");
        setDecisionError(
          "Le contexte a changé. Préparez une nouvelle décision.",
        );
        return;
      }
      if (
        requestId !== decisionRequestId.current ||
        selectedProjectNameRef.current !== projectName
      )
        return;
      await preparePlan();
    } catch {
      if (requestId === decisionRequestId.current)
        setDecisionError("Impossible d’approuver la décision.");
    } finally {
      if (requestId === decisionRequestId.current)
        setDecisionApproveLoading(false);
    }
  }

  async function executePlan(): Promise<void> {
    const candidate = planDetail?.candidate;
    if (selectedProjectName === null || !candidate || !planDetail?.profile)
      return;
    const recommendedProvider =
      planDetail.profile.provider === "openai"
        ? "codex"
        : planDetail.profile.provider === "anthropic"
          ? "claude_code"
          : null;
    if (
      recommendedProvider === null ||
      executeProvider !== recommendedProvider
    ) {
      setExecuteMessage(
        "Le provider approuvé ne correspond plus à la recommandation du plan. Préparez à nouveau le lot.",
      );
      return;
    }
    setExecuteLoading(true);
    setExecuteMessage(null);
    setExecuteResult(null);
    setExecutionSession(null);
    setPatchReview(null);
    setSelectedPatchFile(0);
    setCancelLoading(false);
    try {
      const started = await window.loopDesktop.startExecution({
        projectName: selectedProjectName,
        candidateId: candidate.id,
        provider: executeProvider,
        model: planDetail.profile.model,
      });
      if (!started.ok) {
        setExecuteMessage(started.raw);
        return;
      }
      setExecutionSession(started.session);
    } catch {
      setExecuteMessage("Impossible de lancer l’exécution isolée.");
    } finally {
      setExecuteLoading(false);
    }
  }

  async function cancelActiveExecution(): Promise<void> {
    const session = executionSession;
    if (session === null || session.result !== null) return;
    setCancelLoading(true);
    try {
      await window.loopDesktop.cancelExecution(session.id);
    } catch {
      // Best-effort cancellation request; polling reflects the real outcome.
    }
  }

  async function loadPatchReview(): Promise<void> {
    if (executionSession === null) return;
    setPatchReviewLoading(true);
    try {
      setPatchReview(await window.loopDesktop.patchReview(executionSession.id));
      setSelectedPatchFile(0);
    } catch {
      setPatchReview({ status: "internal_read_failure" });
    } finally {
      setPatchReviewLoading(false);
    }
  }

  useEffect(() => {
    const session = executionSession;
    if (session === null || session.result !== null) return;
    return startExecutionSessionPolling({
      sessionId: session.id,
      fetchSession: (sessionId) =>
        window.loopDesktop.executionSession(sessionId),
      onSession: setExecutionSession,
    });
  }, [executionSession?.id]);

  useEffect(() => {
    if (executionSession?.result !== null && executionSession !== null) {
      setCancelLoading(false);
      if (!executionSession.result.ok) {
        setExecuteMessage(executionSession.result.raw);
        return;
      }

      const detail = parseExecutionResultDetail(executionSession.result.json);
      if (detail === null) {
        setExecuteMessage(
          "La réponse execute ne respecte pas le contrat JSON attendu.",
        );
        return;
      }

      setExecuteResult(detail);
      const historyProjectName = executionSession.request.projectName;
      void window.loopDesktop.runs(historyProjectName).then((result) => {
        if (!result.ok || selectedProjectNameRef.current !== historyProjectName)
          return;
        const history = parseRunHistoryDetail(result.json);
        if (history !== null && history.project === historyProjectName) {
          setRunHistory(history);
          setRunHistoryProjectName(historyProjectName);
          setSelectedRunId(
            (current) => current ?? history.entries[0]?.runId ?? null,
          );
        }
      });
    }
  }, [executionSession]);

  useEffect(() => {
    if (selectedProjectName === null) {
      setReviewDetail(null);
      setReviewError(null);
      setReviewLoading(false);
      return;
    }

    let active = true;
    setReviewDetail(null);
    setReviewError(null);
    setReviewLoading(true);

    void window.loopDesktop
      .review(selectedProjectName)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setReviewError(result.raw);
          return;
        }

        const detail = parseReviewDetail(result.json);
        if (detail === null) {
          setReviewError(
            "La réponse review ne respecte pas le contrat JSON attendu.",
          );
          return;
        }

        setReviewDetail(detail);
      })
      .finally(() => {
        if (active) setReviewLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedProjectName]);

  async function refreshSummary(): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const result = await window.loopDesktop.summary();
      if (!result.ok) {
        setProjects([]);
        setSelectedProjectName(null);
        setError(result.raw);
        return;
      }

      const summary = parseSummaryResponse(result.json);
      if (!summary) {
        setProjects([]);
        setSelectedProjectName(null);
        setError("La réponse summary ne respecte pas le contrat JSON attendu.");
        return;
      }

      setProjects(summary.projects);
      setSelectedProjectName((current) =>
        summary.projects.some((project) => project.project.name === current)
          ? current
          : (summary.projects[0]?.project.name ?? null),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-loop-paper">
      <header className="flex shrink-0 items-center justify-between border-b border-loop-line bg-loop-panel px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="m-0 text-sm font-semibold tracking-tight">
            Loop Engine
          </h1>
          <span className="text-xs text-loop-muted">
            Cockpit local · exécution gouvernée
          </span>
        </div>
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-loop-muted">
          Développement
        </span>
      </header>

      <section className="flex shrink-0 items-center justify-between gap-4 border-b border-loop-line bg-loop-panel px-5 py-3">
        <ol
          className="flex min-w-0 flex-1 items-center gap-2"
          aria-label="Progression du développement"
        >
          {guidedFlowSteps.map((step, index) => {
            const tone =
              step.status === "done"
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : step.status === "active"
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : step.status === "blocked"
                    ? "border-rose-200 bg-rose-50 text-rose-900"
                    : "border-loop-line bg-white text-loop-muted";
            return (
              <li key={step.id} className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${tone}`}
                  aria-current={step.status === "active" ? "step" : undefined}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  <span className="truncate">{step.label}</span>
                </span>
                {index < guidedFlowSteps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="h-px w-4 shrink-0 bg-loop-line"
                  />
                )}
              </li>
            );
          })}
        </ol>
        <Button type="button" disabled={loading} onClick={refreshSummary}>
          {loading ? "Chargement…" : "Actualiser"}
        </Button>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(260px,0.8fr)_minmax(0,2fr)]">
        <aside
          className="min-h-0 overflow-y-auto border-r border-loop-line bg-loop-panel"
          aria-label="Projects"
        >
          <div className="border-b border-loop-line px-5 py-4">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.14em] text-loop-muted">
              Projets
            </p>
          </div>
          {loading && (
            <p className="px-5 py-6 text-sm text-loop-muted">
              Chargement des projets…
            </p>
          )}
          {!loading && error && (
            <p className="px-5 py-6 text-sm text-rose-700">
              Impossible de charger le summary.
            </p>
          )}
          {!loading && !error && projects.length === 0 && (
            <p className="px-5 py-6 text-sm text-loop-muted">
              Actualisez pour afficher les projets.
            </p>
          )}
          {!loading &&
            !error &&
            projects.map((project) => {
              const selected = project.project.name === selectedProjectName;
              return (
                <button
                  key={project.project.name}
                  type="button"
                  onClick={() => selectProject(project.project.name)}
                  className={`w-full border-b border-loop-line px-5 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 ${selected ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-semibold">
                      {project.project.name}
                    </span>
                    <HealthMark health={project.health} />
                  </span>
                  <span className="mt-1 block truncate text-xs text-loop-muted">
                    {project.git.branch}
                  </span>
                  <span className="mt-2 block text-xs font-medium">
                    {formatWorkAvailability(project)}
                  </span>
                  <span className="mt-1 block text-xs text-loop-muted">
                    {formatLastRun(project)}
                  </span>
                  {(project.runHistoryCorruptedLines ?? 0) > 0 && (
                    <span className="mt-1 block text-xs text-amber-700">
                      Historique partiellement illisible (
                      {project.runHistoryCorruptedLines})
                    </span>
                  )}
                </button>
              );
            })}
        </aside>

        <section className="min-h-0 overflow-y-auto p-6" aria-live="polite">
          {error && (
            <div className="max-w-2xl rounded-md border border-rose-200 bg-rose-50 p-5">
              <h2 className="m-0 text-base font-semibold text-rose-950">
                Erreur technique
              </h2>
              <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words text-xs text-rose-900">
                {error}
              </pre>
            </div>
          )}
          {!error && !selectedProject && !loading && (
            <div className="max-w-xl border-l-2 border-loop-line pl-5">
              <h2 className="m-0 text-lg font-semibold">
                Aucun projet sélectionné
              </h2>
              <p className="mt-2 text-sm leading-6 text-loop-muted">
                La sélection apparaîtra ici après le chargement du summary.
              </p>
            </div>
          )}
          {!error && selectedProject && (
            <article className="max-w-3xl">
              <div className="flex items-start justify-between gap-4 border-b border-loop-line pb-6">
                <div>
                  <p className="m-0 text-xs font-medium uppercase tracking-[0.14em] text-loop-muted">
                    Projet sélectionné
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                    {selectedProject.project.name}
                  </h2>
                </div>
                <HealthMark health={selectedProject.health} />
              </div>
              <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Type
                  </dt>
                  <dd className="mt-2 text-sm font-medium">
                    {selectedProject.project.type}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    État Git
                  </dt>
                  <dd className="mt-2 text-sm font-medium">
                    {contextDetail?.git
                      ? formatGitStatus(contextDetail.git.statusText)
                      : selectedProject.git.clean
                        ? "Propre"
                        : "Modifié"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Branche
                  </dt>
                  <dd className="mt-2 break-all text-sm font-medium">
                    {selectedProject.git.branch}
                  </dd>
                </div>
                {planningDisplay?.modeLabel && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                      Planification
                    </dt>
                    <dd className="mt-2 text-sm font-medium">
                      {planningDisplay.modeLabel}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Santé
                  </dt>
                  <dd className="mt-2">
                    <HealthMark health={selectedProject.health} />
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                    Chemin
                  </dt>
                  <dd className="mt-2 break-all font-mono text-xs text-loop-muted">
                    {selectedProject.project.path}
                  </dd>
                </div>
              </dl>
              {focusedStepId === "work" && (
                <section className="mt-8 border-t border-loop-line pt-6">
                  <h3 className="m-0 text-base font-semibold">
                    {planningDisplay?.heading ?? "Travail recommandé"}
                  </h3>
                  {contextLoading && (
                    <p className="mt-3 text-sm text-loop-muted">
                      Chargement du contexte…
                    </p>
                  )}
                  {contextError && (
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                      {contextError}
                    </pre>
                  )}
                  {contextDetail && (
                    <div className="mt-5 grid gap-6">
                      {contextDetail.roadmap.selectedCandidate && (
                        <section className="rounded-lg border border-loop-line bg-white p-5">
                          <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                            Prochain travail recommandé
                          </p>
                          {contextDetail.roadmap.selectedCandidate.id && (
                            <p className="mt-3 font-mono text-sm font-semibold">
                              {contextDetail.roadmap.selectedCandidate.id}
                            </p>
                          )}
                          <h4 className="mt-2 text-lg font-semibold leading-7">
                            {formatCandidateTitle(
                              contextDetail.roadmap.selectedCandidate,
                            )}
                          </h4>
                          <p className="mt-3 text-sm text-loop-muted">
                            {formatCandidateState(
                              contextDetail.roadmap.selectedCandidate,
                            )}
                          </p>
                          {!hasAddressableCandidate(
                            contextDetail.roadmap.selectedCandidate,
                          ) ? (
                            <p className="mt-4 text-sm text-rose-700">
                              Ce travail n’est pas adressable automatiquement.
                              Vérifiez la roadmap avant de continuer.
                            </p>
                          ) : (
                            <Button
                              type="button"
                              className="mt-5"
                              disabled={planLoading}
                              onClick={preparePlan}
                            >
                              {planLoading
                                ? "Préparation…"
                                : "Préparer ce travail"}
                            </Button>
                          )}
                        </section>
                      )}
                      {!contextDetail.roadmap.selectedCandidate &&
                        planningDisplay && (
                          <section className="rounded-lg border border-loop-line bg-white p-5">
                            <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                              {planningDisplay.heading}
                            </p>
                            <p className="mt-3 text-sm text-loop-muted">
                              {planningDisplay.description}
                            </p>
                            {planningDisplay.blockedGates.length > 0 && (
                              <ul className="mt-3 space-y-1 font-mono text-xs text-loop-muted">
                                {planningDisplay.blockedGates.map((gate) => (
                                  <li key={gate}>{gate}</li>
                                ))}
                              </ul>
                            )}
                            {planningDisplay.showRoadmapProposalAction && (
                              <div className="mt-5">
                                {availableProposalEstimate &&
                                  selectedProposalEstimate && (
                                    <div className="mb-4 grid gap-3">
                                      <label className="grid max-w-xs gap-1 text-xs text-loop-muted">
                                        <span>Profil utilisé</span>
                                        <select
                                          value={proposalProfileSelection}
                                          disabled={proposalLoading}
                                          onChange={(event) =>
                                            selectProposalProfile(
                                              event.currentTarget.value,
                                            )
                                          }
                                          className="rounded-md border border-loop-line bg-white px-3 py-2 text-sm font-medium text-loop-ink"
                                        >
                                          <option value="auto">
                                            Automatique
                                          </option>
                                          <option value="economy">
                                            Économique
                                          </option>
                                          <option value="balanced">
                                            Équilibré
                                          </option>
                                          <option value="deep">
                                            Approfondi
                                          </option>
                                        </select>
                                      </label>
                                      <div className="flex items-center justify-between gap-3 text-xs text-loop-muted">
                                        <span>
                                          Profil recommandé :{" "}
                                          <span className="font-medium text-loop-ink">
                                            {ROADMAP_PROPOSAL_PROFILE_LABELS[
                                              availableProposalEstimate.profile
                                            ] ??
                                              availableProposalEstimate.profile}
                                          </span>
                                        </span>
                                      </div>
                                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-loop-muted">
                                        <dt>Modèle</dt>
                                        <dd className="text-right font-medium text-loop-ink">
                                          {selectedProposalEstimate.model}
                                        </dd>
                                        <dt>Effort</dt>
                                        <dd className="text-right font-medium text-loop-ink">
                                          {selectedProposalEstimate.effort ??
                                            "—"}
                                        </dd>
                                        <dt>Entrée estimée</dt>
                                        <dd className="text-right font-medium text-loop-ink">
                                          ~
                                          {
                                            selectedProposalEstimate.estimatedInputTokens
                                          }{" "}
                                          tokens
                                        </dd>
                                        <dt>Sortie estimée</dt>
                                        <dd className="text-right font-medium text-loop-ink">
                                          ~
                                          {
                                            selectedProposalEstimate.estimatedOutputTokens
                                          }{" "}
                                          tokens
                                        </dd>
                                        {selectedProposalEstimate.estimatedCostUsd !==
                                          undefined && (
                                          <>
                                            <dt>Coût estimé</dt>
                                            <dd className="text-right font-medium text-loop-ink">
                                              ~$
                                              {selectedProposalEstimate.estimatedCostUsd.toFixed(
                                                4,
                                              )}
                                            </dd>
                                          </>
                                        )}
                                      </dl>
                                    </div>
                                  )}
                                <Button
                                  type="button"
                                  disabled={proposalLoading}
                                  onClick={analyzeRoadmapContinuation}
                                >
                                  {proposalLoading
                                    ? "Analyse en cours…"
                                    : "Analyser la suite"}
                                </Button>
                                {proposalError && (
                                  <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                                    {proposalError}
                                  </pre>
                                )}
                                {proposalReport &&
                                  proposalProjectName ===
                                    selectedProjectName && (
                                    <div className="mt-4 rounded-lg border border-loop-line bg-white p-5">
                                      {proposalReport.result.status !==
                                        "completed" && (
                                        <p className="m-0 text-sm text-rose-700">
                                          {proposalReport.result.status ===
                                          "failed"
                                            ? "Analyse invalide"
                                            : proposalReport.result.reason}
                                        </p>
                                      )}
                                      {proposalReport.result.status ===
                                        "failed" &&
                                        proposalReport.result.model && (
                                          <p className="m-0 text-xs text-loop-muted">
                                            {proposalReport.result.model}
                                            {` · effort ${proposalReport.result.effort ?? "—"}`}
                                            {proposalReport.result.usage &&
                                              ` · ${proposalReport.result.usage.inputTokens} tokens entrée / ${proposalReport.result.usage.outputTokens} tokens sortie`}
                                            {proposalReport.result
                                              .durationMs !== undefined &&
                                              ` · ${proposalReport.result.durationMs} ms`}
                                            {proposalReport.result
                                              .actualCalculatedCostUsd !==
                                              undefined &&
                                              ` · coût réel calculé $${proposalReport.result.actualCalculatedCostUsd.toFixed(4)}`}
                                          </p>
                                        )}
                                      {proposalReport.result.status ===
                                        "completed" && (
                                        <p className="m-0 text-xs text-loop-muted">
                                          {proposalReport.result.model}
                                          {proposalReport.result.effort
                                            ? ` · effort ${proposalReport.result.effort}`
                                            : ""}
                                          {proposalReport.result.usage &&
                                            ` · ${proposalReport.result.usage.inputTokens} tokens entrée / ${proposalReport.result.usage.outputTokens} tokens sortie`}
                                          {` · ${proposalReport.result.durationMs} ms`}
                                          {proposalReport.result
                                            .actualCalculatedCostUsd !==
                                            undefined &&
                                            ` · coût réel calculé $${proposalReport.result.actualCalculatedCostUsd.toFixed(4)}`}
                                        </p>
                                      )}
                                      {proposalReport.result.status ===
                                        "completed" &&
                                        proposalReport.result
                                          .normalizationWarnings &&
                                        proposalReport.result
                                          .normalizationWarnings.length > 0 && (
                                          <p className="m-0 text-xs text-amber-700">
                                            Réponse normalisée :{" "}
                                            {proposalReport.result.normalizationWarnings.join(
                                              ", ",
                                            )}
                                          </p>
                                        )}
                                      {proposalReport.result.status ===
                                        "completed" &&
                                        proposalReport.proposal?.status ===
                                          "no_proposal" && (
                                          <>
                                            <p className="m-0 text-sm font-semibold">
                                              Aucun nouveau travail justifié
                                            </p>
                                            <p className="mt-2 text-sm text-loop-muted">
                                              {proposalReport.proposal.reason}
                                            </p>
                                          </>
                                        )}
                                      {proposalReport.result.status ===
                                        "completed" &&
                                        proposalReport.proposal?.status ===
                                          "proposed" && (
                                          <>
                                            {proposalReport.assessment &&
                                              proposalReport.assessment
                                                .observedGaps.length > 0 && (
                                                <section>
                                                  <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                                    Écarts observés
                                                  </p>
                                                  <ul className="mt-2 space-y-1 text-sm">
                                                    {proposalReport.assessment.observedGaps.map(
                                                      (gap) => (
                                                        <li key={gap}>{gap}</li>
                                                      ),
                                                    )}
                                                  </ul>
                                                </section>
                                              )}
                                            <section className="mt-4">
                                              <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                                Lots proposés
                                              </p>
                                              <ol className="mt-2 space-y-2 text-sm">
                                                {proposalReport.proposal.lots.map(
                                                  (lot, index) => (
                                                    <li
                                                      key={`${index}:${lot.title}`}
                                                    >
                                                      <span className="font-semibold">
                                                        {index + 1}. {lot.title}
                                                      </span>
                                                      <span className="text-loop-muted">
                                                        {" "}
                                                        — {lot.objective}
                                                      </span>
                                                    </li>
                                                  ),
                                                )}
                                              </ol>
                                            </section>
                                            {proposalReport.assessment &&
                                              proposalReport.assessment
                                                .assumptions.length > 0 && (
                                                <section className="mt-4">
                                                  <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                                    Hypothèses
                                                  </p>
                                                  <ul className="mt-2 space-y-1 text-sm text-loop-muted">
                                                    {proposalReport.assessment.assumptions.map(
                                                      (assumption) => (
                                                        <li key={assumption}>
                                                          {assumption}
                                                        </li>
                                                      ),
                                                    )}
                                                  </ul>
                                                </section>
                                              )}
                                          </>
                                        )}
                                    </div>
                                  )}
                              </div>
                            )}
                            {planningDisplay.showGateReassessmentAction && (
                              <div className="mt-5">
                                {availableProposalEstimate &&
                                  selectedProposalEstimate && (
                                    <div className="mb-4 grid gap-2 text-xs text-loop-muted">
                                      <label className="grid max-w-xs gap-1">
                                        <span>Profil utilisé</span>
                                        <select
                                          value={proposalProfileSelection}
                                          onChange={(event) =>
                                            selectProposalProfile(
                                              event.currentTarget.value,
                                            )
                                          }
                                          className="rounded-md border border-loop-line bg-white px-3 py-2 text-sm font-medium text-loop-ink"
                                        >
                                          <option value="auto">
                                            Automatique
                                          </option>
                                          <option value="economy">
                                            Économique
                                          </option>
                                          <option value="balanced">
                                            Équilibré
                                          </option>
                                          <option value="deep">
                                            Approfondi
                                          </option>
                                        </select>
                                      </label>
                                      <span>
                                        Profil recommandé :{" "}
                                        <b>
                                          {
                                            ROADMAP_PROPOSAL_PROFILE_LABELS[
                                              availableProposalEstimate.profile
                                            ]
                                          }
                                        </b>
                                      </span>
                                      <span>
                                        Modèle :{" "}
                                        {selectedProposalEstimate.model}
                                      </span>
                                      <span>
                                        Effort :{" "}
                                        {selectedProposalEstimate.effort ?? "—"}
                                      </span>
                                      <span>
                                        Entrée estimée : ~
                                        {
                                          selectedProposalEstimate.estimatedInputTokens
                                        }{" "}
                                        tokens
                                      </span>
                                      <span>
                                        Sortie estimée : ~
                                        {
                                          selectedProposalEstimate.estimatedOutputTokens
                                        }{" "}
                                        tokens
                                      </span>
                                      {selectedProposalEstimate.estimatedCostUsd !==
                                        undefined && (
                                        <span>
                                          Coût estimé : ~$
                                          {selectedProposalEstimate.estimatedCostUsd.toFixed(
                                            4,
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                <Button
                                  type="button"
                                  disabled={gateReassessmentLoading}
                                  onClick={reassessGates}
                                >
                                  {gateReassessmentLoading
                                    ? "Réévaluation…"
                                    : "Réévaluer les conditions"}
                                </Button>
                                {gateReassessmentReport &&
                                  gateReassessmentProjectName ===
                                    selectedProjectName &&
                                  gateReassessmentReport.result.status ===
                                    "completed" &&
                                  gateReassessmentReport.assessment && (
                                    <div className="mt-4 rounded-lg border border-loop-line bg-white p-5 text-sm">
                                      <p className="m-0 font-semibold">
                                        {gateReassessmentReport.assessment
                                          .status === "no_new_signal"
                                          ? "Aucun signal nouveau"
                                          : "Revue manuelle recommandée"}
                                      </p>
                                      <p className="mt-2 text-loop-muted">
                                        {
                                          gateReassessmentReport.assessment
                                            .reason
                                        }
                                      </p>
                                      <p className="mt-2 text-xs text-loop-muted">
                                        {gateReassessmentReport.result.provider}{" "}
                                        · {gateReassessmentReport.result.model}{" "}
                                        · effort{" "}
                                        {gateReassessmentReport.result.effort ??
                                          "—"}{" "}
                                        ·{" "}
                                        {
                                          gateReassessmentReport.result
                                            .durationMs
                                        }{" "}
                                        ms
                                        {gateReassessmentReport.result.usage &&
                                          ` · ${gateReassessmentReport.result.usage.inputTokens} entrée / ${gateReassessmentReport.result.usage.outputTokens} sortie`}
                                        {gateReassessmentReport.result
                                          .actualCalculatedCostUsd !==
                                          undefined &&
                                          ` · coût réel calculé $${gateReassessmentReport.result.actualCalculatedCostUsd.toFixed(4)}`}
                                      </p>
                                      {gateReassessmentReport.assessment
                                        .status === "review_recommended" && (
                                        <ul className="mt-2 space-y-2 text-loop-muted">
                                          {gateReassessmentReport.assessment.gates.map(
                                            (gate) => (
                                              <li
                                                key={`${gate.phase}:${gate.blockedBy}`}
                                              >
                                                {gate.phase} · {gate.blockedBy}{" "}
                                                — {gate.observedSignal}
                                                <br />
                                                {gate.recommendation}
                                              </li>
                                            ),
                                          )}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                              </div>
                            )}
                          </section>
                        )}
                      <details className="rounded-md border border-loop-line bg-neutral-50 p-4">
                        <summary className="cursor-pointer text-sm font-medium">
                          Détails techniques
                        </summary>
                        <div className="mt-5 grid gap-6">
                          <section>
                            <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                              Documentation
                            </h4>
                            <p className="mt-2 text-sm">
                              {contextDetail.docs.missing.length === 0
                                ? "Toutes les sources requises sont présentes."
                                : `${contextDetail.docs.missing.length} source(s) requise(s) manquante(s).`}
                            </p>
                            <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                              {contextDetail.docs.required.map((path) => (
                                <li key={path}>{path}</li>
                              ))}
                            </ul>
                          </section>
                          <section>
                            <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                              Roadmap
                            </h4>
                            <p className="mt-2 text-sm">
                              {planningDisplay?.roadmapDetail ??
                                (contextDetail.roadmap.available
                                  ? "Roadmap configurée."
                                  : "Aucune roadmap configurée.")}
                            </p>
                            {contextDetail.roadmap.paths.map((path) => (
                              <p
                                key={path}
                                className="mt-1 font-mono text-xs text-loop-muted"
                              >
                                {path}
                              </p>
                            ))}
                            {contextDetail.roadmap.phaseGates
                              .filter((gate) => gate.state === "closed")
                              .map((gate) => (
                                <p
                                  key={gate.phaseId}
                                  className="mt-2 text-sm text-loop-muted"
                                >
                                  Phase {gate.phaseId} fermée
                                  {gate.blockedBy
                                    ? ` par la gate ${gate.blockedBy}.`
                                    : "."}
                                  {
                                    " Les candidats de cette phase ne sont pas admissibles."
                                  }
                                </p>
                              ))}
                          </section>
                          <section>
                            <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                              Validation
                            </h4>
                            <p className="mt-2 text-sm">
                              {contextDetail.validation.configured
                                ? "Commandes configurées."
                                : "Aucune commande configurée."}
                            </p>
                            <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                              {contextDetail.validation.commands.map(
                                (command) => (
                                  <li key={command}>{command}</li>
                                ),
                              )}
                            </ul>
                          </section>
                        </div>
                      </details>
                    </div>
                  )}
                </section>
              )}
              {(focusedStepId === "prepare" ||
                focusedStepId === "execute" ||
                focusedStepId === "result") && (
                <section className="mt-8 border-t border-loop-line pt-6">
                  <h3 className="m-0 text-base font-semibold">
                    {focusedStepId === "prepare"
                      ? "Préparation"
                      : focusedStepId === "execute"
                        ? "Exécution"
                        : "Résultat"}
                  </h3>
                  {planLoading && (
                    <p className="mt-3 text-sm text-loop-muted">
                      Préparation du plan…
                    </p>
                  )}
                  {planError && (
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                      {planError}
                    </pre>
                  )}
                  {decisionRenewalCode && decisionDraft === null && (
                    <section className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-5">
                      <h4 className="m-0 text-base font-semibold text-amber-950">
                        Décision d’exécution à renouveler
                      </h4>
                      <p className="mt-2 text-sm text-amber-900">
                        {executionDecisionRenewalMessage(decisionRenewalCode)}
                      </p>
                      {decisionError && (
                        <p className="mt-3 text-sm text-rose-700">
                          {decisionError}
                        </p>
                      )}
                      {decisionProviderDetails && (
                        <p className="mt-2 text-xs text-loop-muted">
                          Code : {decisionProviderDetails.failureCode ?? "—"}
                          {decisionProviderDetails.httpStatus !== undefined &&
                            ` · HTTP : ${decisionProviderDetails.httpStatus}`}
                          {decisionProviderDetails.model &&
                            ` · Modèle : ${decisionProviderDetails.model}`}
                          {decisionProviderDetails.durationMs !== undefined &&
                            ` · Durée : ${decisionProviderDetails.durationMs} ms`}
                        </p>
                      )}
                      <Button
                        type="button"
                        className="mt-4"
                        disabled={
                          decisionPrepareLoading || decisionApproveLoading
                        }
                        onClick={prepareExecutionDecision}
                      >
                        {decisionPrepareLoading
                          ? "Préparation du brouillon…"
                          : "Préparer une nouvelle décision"}
                      </Button>
                    </section>
                  )}
                  {decisionDraft !== null && (
                    <div className="mt-4 rounded-md border border-amber-200 bg-white p-4">
                      <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-amber-900">
                        Brouillon de décision
                      </p>
                      <dl className="mt-3 grid gap-3 text-sm">
                        <div>
                          <dt className="font-medium">Candidat</dt>
                          <dd>{decisionDraft.candidateId}</dd>
                        </div>
                        <div>
                          <dt className="font-medium">Objectif</dt>
                          <dd>{decisionDraft.objective}</dd>
                        </div>
                        <div>
                          <dt className="font-medium">Livrables</dt>
                          <dd>{decisionDraft.deliverables.join(" · ")}</dd>
                        </div>
                        <div>
                          <dt className="font-medium">Hors périmètre</dt>
                          <dd>{decisionDraft.outOfScope.join(" · ")}</dd>
                        </div>
                        <div>
                          <dt className="font-medium">Fichiers autorisés</dt>
                          <dd className="font-mono text-xs">
                            {decisionDraft.allowedPaths.join("\n")}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">HEAD cible</dt>
                          <dd className="font-mono text-xs">
                            {decisionDraft.gitHead}
                          </dd>
                        </div>
                      </dl>
                      <p className="mt-4 text-sm font-medium text-amber-900">
                        Ce brouillon n’autorise encore aucune exécution.
                      </p>
                      {decisionError && (
                        <p className="mt-3 text-sm text-rose-700">
                          {decisionError}
                        </p>
                      )}
                      <Button
                        type="button"
                        className="mt-4"
                        disabled={
                          decisionApproveLoading || decisionPrepareLoading
                        }
                        onClick={approveExecutionDecision}
                      >
                        {decisionApproveLoading
                          ? "Approbation…"
                          : "Approuver cette décision"}
                      </Button>
                    </div>
                  )}
                  {planDetail &&
                    isPlanForSelectedProject(
                      planProjectName,
                      selectedProjectName,
                    ) && (
                      <div className="mt-5 grid gap-6">
                        <section className="rounded-lg border border-loop-line bg-white p-5">
                          <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                            Fiche de mission
                          </p>
                          <p className="mt-3 font-mono text-sm font-semibold">
                            {planDetail.candidate.id}
                          </p>
                          <h4 className="mt-2 text-lg font-semibold">
                            {formatCandidateTitle(planDetail.candidate)}
                          </h4>
                          <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                Objectif
                              </dt>
                              <dd className="mt-2 text-sm">
                                {planDetail.brief?.objective ??
                                  "Aucun résumé structuré n’est déclaré dans la décision de gouvernance."}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                Livrables attendus
                              </dt>
                              <dd className="mt-2">
                                {planDetail.brief ? (
                                  <ul className="space-y-1 text-sm text-loop-muted">
                                    {planDetail.brief.deliverables.map(
                                      (deliverable) => (
                                        <li key={deliverable}>{deliverable}</li>
                                      ),
                                    )}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-loop-muted">
                                    Non précisés.
                                  </p>
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                Hors périmètre
                              </dt>
                              <dd className="mt-2">
                                {planDetail.brief ? (
                                  <ul className="space-y-1 text-sm text-loop-muted">
                                    {planDetail.brief.outOfScope.map((item) => (
                                      <li key={item}>{item}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-loop-muted">
                                    Non précisé.
                                  </p>
                                )}
                              </dd>
                            </div>
                            <div className="sm:col-span-2">
                              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                Périmètre d’écriture autorisé
                              </dt>
                              <dd className="mt-2">
                                {planDetail.writableFileScope ? (
                                  <ul className="space-y-1 font-mono text-xs text-loop-muted">
                                    {planDetail.writableFileScope.map(
                                      (path) => (
                                        <li key={path}>{path}</li>
                                      ),
                                    )}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-loop-muted">
                                    Aucun périmètre d’écriture gouverné n’est
                                    déclaré.
                                  </p>
                                )}
                              </dd>
                            </div>
                          </dl>
                        </section>
                        <section>
                          <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                            Recommandation IA
                          </h4>
                          {planDetail.profile ? (
                            <>
                              <p className="mt-2 text-sm font-medium">
                                {planDetail.profile.provider} ·{" "}
                                {planDetail.profile.model} · effort{" "}
                                {planDetail.profile.effort}
                              </p>
                              <p className="mt-2 text-sm text-loop-muted">
                                Catégorie : {planDetail.profile.category} ·
                                budget maximal de contexte :{" "}
                                {planDetail.profile.contextBudgetTokens} tokens
                                (plafond, pas une consommation réelle).
                              </p>
                              {planDetail.profile.fallbackActive && (
                                <p className="mt-2 text-xs text-amber-800">
                                  Fallback policy : préférence de capacité
                                  indisponible — résolution compatible utilisée
                                  à la place.
                                </p>
                              )}
                              {planDetail.profile.reasons.length > 0 && (
                                <ul className="mt-2 space-y-1 text-xs text-loop-muted">
                                  {getDisplayedAgentRoutingReasons(
                                    planDetail.profile.reasons,
                                  ).map((reason, index) => (
                                    <li key={`${index}:${reason}`}>{reason}</li>
                                  ))}
                                </ul>
                              )}
                              <ul className="mt-2 space-y-1 text-xs text-loop-muted">
                                <li>
                                  Profil choisi automatiquement selon le type,
                                  le périmètre et le budget du lot.
                                </li>
                                <li>
                                  Le plan reste sans appel externe tant que
                                  l’exécution n’est pas confirmée.
                                </li>
                              </ul>
                            </>
                          ) : (
                            <p className="mt-2 text-sm text-loop-muted">
                              Aucun profil prévisionnel sélectionné.
                            </p>
                          )}
                        </section>
                        <section>
                          <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                            Étapes prévues
                          </h4>
                          <ul className="mt-2 space-y-1 text-sm">
                            {formatPlanSteps(planDetail).map(
                              (detail, index) => (
                                <li key={`${index}:${detail}`}>{detail}</li>
                              ),
                            )}
                          </ul>
                        </section>
                        {planDetail.context && (
                          <section>
                            <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                              Contexte borné
                            </h4>
                            <p className="mt-2 text-sm">
                              {planDetail.context.files.length} fichier(s) ·{" "}
                              {planDetail.context.estimatedTokens} tokens
                              estimés
                              {planDetail.context.truncated ? " · tronqué" : ""}
                            </p>
                            {planDetail.profile && (
                              <p className="mt-1 text-sm text-loop-muted">
                                Réserve estimée :{" "}
                                {Math.max(
                                  0,
                                  planDetail.profile.contextBudgetTokens -
                                    planDetail.context.estimatedTokens,
                                )}{" "}
                                tokens. Chaque exécution démarre dans une
                                session isolée, sans réutiliser l’historique
                                brut.
                              </p>
                            )}
                            <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                              {planDetail.context.files.map((path) => (
                                <li key={path}>{path}</li>
                              ))}
                            </ul>
                          </section>
                        )}
                        <p className="m-0 text-xs text-loop-muted">
                          Ce plan n’exécute aucun provider.
                        </p>
                        <section className="border-t border-loop-line pt-6">
                          <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                            Exécution isolée confirmée
                          </h4>
                          <p className="mt-2 text-sm">
                            Projet : {planDetail.project} · candidat :{" "}
                            {planDetail.candidate.id}
                          </p>
                          <p className="mt-3 text-sm">
                            Exécution avec la recommandation du plan
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {planDetail.profile
                              ? `${executeProvider === "codex" ? "Codex" : "Claude Code"} · ${planDetail.profile.model} · effort ${planDetail.profile.effort}`
                              : "Aucun profil recommandé."}
                          </p>
                          <p className="mt-3 text-sm">
                            Validations prévues :{" "}
                            {contextDetail?.validation.commands.length ?? 0} ·
                            maxRepairs : 0
                          </p>
                          <p className="mt-2 text-sm text-loop-muted">
                            Le provider s’exécute dans un worktree Git isolé,
                            mais n’est pas sandboxé au niveau du système
                            d’exploitation.
                          </p>
                          <p className="mt-2 text-sm text-loop-muted">
                            Le dépôt source ne sera pas modifié et le patch ne
                            sera pas appliqué automatiquement.
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            className="mt-3"
                            disabled={
                              executeLoading ||
                              executionSession?.result === null
                            }
                            onClick={executePlan}
                          >
                            {executeLoading
                              ? "Exécution isolée en cours…"
                              : "Confirmer et choisir la destination du patch"}
                          </Button>
                          {canCancelExecution(executionSession) && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="mt-3 ml-2"
                              disabled={cancelLoading}
                              onClick={cancelActiveExecution}
                            >
                              {cancelLoading
                                ? "Annulation demandée…"
                                : "Annuler l’exécution"}
                            </Button>
                          )}
                          {executionSession && (
                            <section
                              className="mt-4 rounded-md border border-loop-line bg-neutral-50 p-4"
                              aria-label="Session d’exécution observable"
                            >
                              <p className="m-0 text-sm font-medium">
                                Session observable
                              </p>
                              <p className="mt-2 text-sm text-loop-muted">
                                Projet : {executionSession.request.projectName}{" "}
                                · candidat :{" "}
                                {executionSession.request.candidateId}
                              </p>
                              <p className="mt-1 text-sm text-loop-muted">
                                Provider : {executionSession.request.provider} ·
                                modèle : {executionSession.request.model} ·
                                effort :{" "}
                                {planDetail.profile?.effort ?? "non disponible"}
                              </p>
                              <p className="mt-3 text-sm font-medium">
                                Statut :{" "}
                                {executionSession.result === null
                                  ? cancelLoading
                                    ? "annulation demandée…"
                                    : "en cours"
                                  : executionSession.events.at(-1)?.type ===
                                      "cancelled"
                                    ? "annulé"
                                    : executionSession.events.at(-1)?.type ===
                                        "failed"
                                      ? "échec"
                                      : "terminé"}
                              </p>
                              <p className="mt-1 text-sm text-loop-muted">
                                Export du patch :{" "}
                                {executeResult?.patchExport
                                  ? "exporté"
                                  : executionSession.result === null
                                    ? "en attente de validation"
                                    : "non exporté"}
                              </p>
                              <ol className="mt-2 space-y-1 text-sm text-loop-muted">
                                {executionSession.events.map((event) => (
                                  <li key={event.sequence}>
                                    {event.sequence}.{" "}
                                    {
                                      {
                                        session_started: "Session démarrée",
                                        preparing: "Préparation",
                                        execution_started:
                                          "Provider / exécution",
                                        validation_started: "Validation",
                                        completed: "Terminé",
                                        failed: "Échec",
                                        cancelled: "Annulé",
                                      }[event.type]
                                    }
                                  </li>
                                ))}
                              </ol>
                            </section>
                          )}
                          {executeMessage && (
                            <p className="mt-3 text-sm text-loop-muted">
                              {executeMessage}
                            </p>
                          )}
                          {executeResult && (
                            <div className="mt-4 space-y-4 text-sm">
                              <section>
                                <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                  Résultat
                                </h4>
                                <p className="mt-2 font-medium">
                                  {formatExecutionResultStatus(
                                    executeResult.status,
                                  )}
                                </p>
                              </section>
                              <section>
                                <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                  Fichiers modifiés
                                </h4>
                                {executeResult.modifiedFiles.length === 0 ? (
                                  <p className="mt-2 text-loop-muted">
                                    Aucun fichier modifié.
                                  </p>
                                ) : (
                                  <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                                    {executeResult.modifiedFiles.map((path) => (
                                      <li key={path}>{path}</li>
                                    ))}
                                  </ul>
                                )}
                              </section>
                              {executeResult.validation && (
                                <section>
                                  <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                    Validation
                                  </h4>
                                  <p className="mt-2">
                                    {formatExecutionValidationStatus(
                                      executeResult.validation.status,
                                    )}
                                  </p>
                                  <p className="mt-1 text-loop-muted">
                                    {executeResult.validation.attempts}{" "}
                                    tentative(s) ·{" "}
                                    {executeResult.validation.repairAttempts}{" "}
                                    réparation(s)
                                  </p>
                                  {executeResult.validation.failedCommand !==
                                    null && (
                                    <p className="mt-1 text-loop-muted">
                                      Commande échouée :{" "}
                                      {executeResult.validation.failedCommand}{" "}
                                      (code {executeResult.validation.exitCode})
                                    </p>
                                  )}
                                </section>
                              )}
                              <section>
                                <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                  Patch
                                </h4>
                                {executeResult.patchExport ? (
                                  <>
                                    <p className="mt-2">Exporté</p>
                                    <p className="mt-1 text-loop-muted">
                                      {executeResult.patchExport.fileCount}{" "}
                                      fichier(s)
                                    </p>
                                    <p className="mt-1 font-mono text-xs text-loop-muted">
                                      {executeResult.patchExport.path}
                                    </p>
                                    <p className="mt-1 font-mono text-xs text-loop-muted">
                                      SHA-256 :{" "}
                                      {executeResult.patchExport.sha256}
                                    </p>
                                    <p className="mt-1 font-mono text-xs text-loop-muted">
                                      Base Git :{" "}
                                      {executeResult.patchExport.baseSha}
                                    </p>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      className="mt-3"
                                      disabled={patchReviewLoading}
                                      onClick={loadPatchReview}
                                    >
                                      {patchReviewLoading
                                        ? "Lecture du patch…"
                                        : "Relire le patch"}
                                    </Button>
                                  </>
                                ) : (
                                  <p className="mt-2 text-loop-muted">
                                    Non exporté
                                  </p>
                                )}
                                <p className="mt-2 text-xs text-loop-muted">
                                  Dépôt source non modifié.
                                </p>
                              </section>
                              {patchReview && (
                                <section
                                  className="patch-review rounded-lg border border-loop-line bg-white p-4"
                                  aria-label="Revue du patch exporté"
                                >
                                  <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                    Patch Review
                                  </h4>
                                  {patchReview.status !== "ready" ? (
                                    <p className="mt-2 text-sm text-amber-800">
                                      Le patch ne peut pas être inspecté :{" "}
                                      {patchReview.status}.
                                    </p>
                                  ) : (
                                    <>
                                      <p className="mt-2 text-sm">
                                        {patchReview.fileCount} fichier(s) ·{" "}
                                        <span className="text-emerald-700">
                                          +{patchReview.additions}
                                        </span>{" "}
                                        ·{" "}
                                        <span className="text-rose-700">
                                          -{patchReview.deletions}
                                        </span>
                                      </p>
                                      <p className="mt-1 font-mono text-xs text-loop-muted">
                                        SHA-256 : {patchReview.sha256}
                                      </p>
                                      <p className="mt-1 font-mono text-xs text-loop-muted">
                                        Base Git : {patchReview.baseSha}
                                      </p>
                                      <div className="patch-review-grid mt-4 grid gap-4 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)]">
                                        <ol className="divide-y divide-loop-line rounded border border-loop-line">
                                          {patchReview.files.map(
                                            (file, index) => (
                                              <li
                                                key={`${file.oldPath}:${file.newPath}`}
                                              >
                                                <button
                                                  type="button"
                                                  aria-pressed={
                                                    selectedPatchFile === index
                                                  }
                                                  onClick={() =>
                                                    setSelectedPatchFile(index)
                                                  }
                                                  className={`w-full px-3 py-2 text-left font-mono text-xs ${selectedPatchFile === index ? "bg-loop-paper" : ""}`}
                                                >
                                                  {file.newPath ?? file.oldPath}{" "}
                                                  <span className="font-sans text-loop-muted">
                                                    {file.status} +
                                                    {file.additions} -
                                                    {file.deletions}
                                                  </span>
                                                </button>
                                              </li>
                                            ),
                                          )}
                                        </ol>
                                        {selectedPatchReviewFile && (
                                          <PatchDiff
                                            file={selectedPatchReviewFile}
                                          />
                                        )}
                                      </div>
                                    </>
                                  )}
                                </section>
                              )}
                              {executeResult.failure && (
                                <section className="rounded-md border border-rose-200 bg-rose-50 p-3">
                                  <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-rose-700">
                                    Échec
                                  </h4>
                                  <p className="mt-2 font-medium text-rose-900">
                                    {executeResult.failure.code}
                                  </p>
                                  <p className="mt-1 text-rose-900">
                                    {executeResult.failure.message}
                                  </p>
                                  {executeResult.failure.details.length > 0 && (
                                    <ul className="mt-2 space-y-1 text-xs text-rose-900">
                                      {executeResult.failure.details.map(
                                        (detail, index) => (
                                          <li key={`${index}:${detail}`}>
                                            {detail}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  )}
                                </section>
                              )}
                            </div>
                          )}
                        </section>
                      </div>
                    )}
                </section>
              )}
              {focusedStepId === "result" && (
                <section className="mt-8 border-t border-loop-line pt-6">
                  <h3 className="m-0 text-base font-semibold">Review</h3>
                  {reviewLoading && (
                    <p className="mt-3 text-sm text-loop-muted">
                      Chargement de la review…
                    </p>
                  )}
                  {reviewError && (
                    <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words rounded-md border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
                      {reviewError}
                    </pre>
                  )}
                  {reviewDetail && (
                    <div className="mt-5 grid gap-6">
                      <section>
                        <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                          État Git
                        </h4>
                        <p className="mt-2 text-sm">
                          {reviewDetail.git.requiresGit
                            ? `${reviewDetail.git.branch} · ${reviewDetail.git.clean ? "propre" : "modifié"}`
                            : "Git non requis."}
                        </p>
                        {reviewDetail.gitStatus && (
                          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md border border-loop-line p-4 font-mono text-xs text-loop-muted">
                            {reviewDetail.gitStatus}
                          </pre>
                        )}
                      </section>
                      <section>
                        <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                          Diff
                        </h4>
                        {reviewDetail.diffStat ? (
                          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-md border border-loop-line p-4 font-mono text-xs text-loop-muted">
                            {reviewDetail.diffStat}
                          </pre>
                        ) : (
                          <p className="mt-2 text-sm text-loop-muted">
                            Aucun résumé de diff.
                          </p>
                        )}
                        {reviewDetail.documentationImpact.changedPaths.length >
                          0 && (
                          <ul className="mt-3 space-y-1 font-mono text-xs text-loop-muted">
                            {reviewDetail.documentationImpact.changedPaths.map(
                              (path) => (
                                <li key={path}>{path}</li>
                              ),
                            )}
                          </ul>
                        )}
                      </section>
                      <section>
                        <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                          Impact documentaire
                        </h4>
                        <p className="mt-2 text-sm">
                          {reviewDetail.documentationImpact
                            .semanticReviewRequired
                            ? "Review sémantique requise."
                            : "Review sémantique non requise."}
                        </p>
                        {reviewDetail.documentationImpact.impacts.length ===
                        0 ? (
                          <p className="mt-2 text-sm text-loop-muted">
                            Aucun impact documentaire gouverné.
                          </p>
                        ) : (
                          <ul className="mt-3 space-y-3 text-sm">
                            {reviewDetail.documentationImpact.impacts.map(
                              (impact) => (
                                <li key={`${impact.document}:${impact.reason}`}>
                                  <p className="m-0 font-mono text-xs text-loop-muted">
                                    {impact.required
                                      ? "obligatoire"
                                      : "optionnel"}{" "}
                                    · {impact.document}
                                  </p>
                                  <p className="mt-1">{impact.reason}</p>
                                </li>
                              ),
                            )}
                          </ul>
                        )}
                      </section>
                      <section>
                        <h4 className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                          Validation
                        </h4>
                        <p className="mt-2 text-sm">
                          {reviewDetail.validation.configured
                            ? "Commandes configurées."
                            : "Aucune commande configurée."}
                        </p>
                        <ul className="mt-2 space-y-1 font-mono text-xs text-loop-muted">
                          {reviewDetail.validation.commands.map((command) => (
                            <li key={command}>{command}</li>
                          ))}
                        </ul>
                        <div className="mt-3">
                          <HealthMark health={reviewDetail.health} />
                        </div>
                      </section>
                    </div>
                  )}
                </section>
              )}
              <section className="mt-8 border-t border-loop-line pt-6">
                <h3 className="m-0 text-base font-semibold">Historique</h3>
                {runHistoryLoading && (
                  <p className="mt-3 text-sm text-loop-muted">
                    Chargement de l’historique…
                  </p>
                )}
                {runHistoryError && (
                  <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                    {runHistoryError}
                  </p>
                )}
                {runHistory &&
                  runHistoryProjectName === selectedProjectName && (
                    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
                      <div>
                        {runHistory.corruptedLines > 0 && (
                          <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                            Historique partiellement illisible :{" "}
                            {runHistory.corruptedLines} entrée(s) ignorée(s).
                          </p>
                        )}
                        {runHistory.entries.length === 0 ? (
                          <p className="text-sm text-loop-muted">
                            Aucun run enregistré pour ce projet.
                          </p>
                        ) : (
                          <ol className="divide-y divide-loop-line rounded-lg border border-loop-line bg-white">
                            {runHistory.entries.map((entry) => (
                              <li key={entry.runId}>
                                <button
                                  type="button"
                                  onClick={() => setSelectedRunId(entry.runId)}
                                  className={`w-full px-4 py-3 text-left text-sm hover:bg-loop-paper ${selectedRun?.runId === entry.runId ? "bg-loop-paper" : ""}`}
                                >
                                  <span className="block font-medium">
                                    {entry.completedAt ?? entry.startedAt}
                                  </span>
                                  <span className="mt-1 block text-loop-muted">
                                    {entry.mode} ·{" "}
                                    {formatRunHistoryStatus(entry.status)} · run{" "}
                                    {entry.runId}
                                    {entry.candidateId
                                      ? ` · ${entry.candidateId}`
                                      : ""}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                      {selectedRun && (
                        <section className="rounded-lg border border-loop-line bg-white p-4">
                          <p className="m-0 text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                            Run {selectedRun.runId}
                          </p>
                          <dl className="mt-4 grid gap-4 text-sm">
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                Mode
                              </dt>
                              <dd className="mt-1">{selectedRun.mode}</dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                Statut
                              </dt>
                              <dd className="mt-1">
                                {formatRunHistoryStatus(selectedRun.status)}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                Candidat
                              </dt>
                              <dd className="mt-1 font-mono text-xs">
                                {selectedRun.candidateId ?? "Non renseigné"}
                              </dd>
                            </div>
                            {selectedRun.executionResult?.modifiedFiles
                              .length ? (
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                  Fichiers modifiés
                                </dt>
                                <dd className="mt-1">
                                  <ul className="space-y-1 font-mono text-xs text-loop-muted">
                                    {selectedRun.executionResult.modifiedFiles
                                      .slice(0, 8)
                                      .map((path) => (
                                        <li key={path}>{path}</li>
                                      ))}
                                  </ul>
                                </dd>
                              </div>
                            ) : null}
                            {selectedRun.executionResult?.validation && (
                              <div>
                                <dt className="text-xs font-medium uppercase tracking-[0.12em] text-loop-muted">
                                  Validation
                                </dt>
                                <dd className="mt-1">
                                  {formatExecutionValidationStatus(
                                    selectedRun.executionResult.validation
                                      .status,
                                  )}{" "}
                                  ·{" "}
                                  {
                                    selectedRun.executionResult.validation
                                      .attempts
                                  }{" "}
                                  tentative(s)
                                </dd>
                              </div>
                            )}
                          </dl>
                        </section>
                      )}
                    </div>
                  )}
              </section>
            </article>
          )}
        </section>
      </div>
    </main>
  );
}
