import {
  AGENT_PROVIDERS,
  AGENT_RUNTIMES,
  type AgentBudget,
  type AgentProvider,
  type AgentRuntime,
} from "../agents/types.js";
import type { MinimalContextPackage } from "../context/types.js";
import type { RoadmapCandidate } from "../intelligence/roadmap.js";
import type { AgentPolicyResolution } from "../policy/types.js";
import {
  LOCAL_PROCESS_RUNTIME_ID,
  RUNTIME_ERROR_CODES,
  RUNTIME_RESULT_STATUSES,
  type LocalProcessExecutionPolicy,
  type RuntimeAdapter,
  type RuntimeErrorCode,
  type RuntimeId,
  type RuntimeRequest,
  type RuntimeResult,
  type RuntimeSelectionResult,
} from "../runtime/index.js";
import {
  handleInboundLoopRuntimeRequest,
  type InboundLoopRuntimeRequestEnvelope,
  type InboundLoopRuntimeRequestHandlerDependencies,
} from "./inbound.js";
import type { LoopRuntimeConstructedRuntimeRequest } from "./loop-runtime-public-request-runtime-request.js";
import {
  evaluateRuntimeExecutionAdmission,
  type RuntimeExecutionAdmissionErrorCode,
} from "./runtime-execution-bridge.js";
import { resolveRuntime } from "./runtime.js";

export const PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION = 1 as const;

export const PREPARED_INBOUND_RUNTIME_EXECUTION_FAILURE_REASONS = [
  "execution_context_unavailable",
  "execution_context_invalid",
  "runtime_unavailable",
  "runtime_execution_failed",
  "runtime_result_invalid",
] as const;

export type PreparedInboundRuntimeExecutionFailureReason =
  (typeof PREPARED_INBOUND_RUNTIME_EXECUTION_FAILURE_REASONS)[number];

export type PreparedInboundRuntimeExecutionContext = Readonly<{
  task: RoadmapCandidate;
  contextPackage: MinimalContextPackage;
  policy: AgentPolicyResolution;
  provider: AgentProvider;
  localProcessExecutionPolicy?: LocalProcessExecutionPolicy;
}>;

export type PreparedInboundRuntimeExecutionContextResolution =
  | Readonly<{
      resolved: true;
      context: PreparedInboundRuntimeExecutionContext;
    }>
  | Readonly<{
      resolved: false;
      reason: "execution_context_unavailable" | "execution_context_invalid";
    }>;

export type PreparedInboundRuntimeExecutionContextResolver = Readonly<{
  resolve(
    input: Readonly<{
      requestId: string;
      evaluatedAt: string;
      request: LoopRuntimeConstructedRuntimeRequest;
    }>,
  ):
    | PreparedInboundRuntimeExecutionContextResolution
    | Promise<PreparedInboundRuntimeExecutionContextResolution>;
}>;

export type PreparedInboundRuntimeResolver = (
  request: RuntimeRequest,
) => RuntimeSelectionResult;

export type PreparedInboundRuntimeExecutionDependencies =
  InboundLoopRuntimeRequestHandlerDependencies &
    Readonly<{
      executionContextResolver: PreparedInboundRuntimeExecutionContextResolver;
      runtimeResolver?: PreparedInboundRuntimeResolver;
    }>;

export type PreparedInboundRuntimeExecutionPlan = Readonly<{
  schemaVersion: typeof PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION;
  requestId: string;
  project: string;
  cycleId: string | null;
  mode: "dry-run";
  runtimeId: RuntimeId;
  provider: AgentProvider;
  effort: LoopRuntimeConstructedRuntimeRequest["effort"];
  policyId: string;
  profileId: string;
  evaluatedAt: string;
  limits: LoopRuntimeConstructedRuntimeRequest["limits"];
}>;

export type PreparedInboundRuntimeExecutionReceipt = Readonly<{
  schemaVersion: typeof PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION;
  requestId: string;
  project: string;
  cycleId: string | null;
  runtimeId: RuntimeId;
  provider: AgentProvider;
  effort: LoopRuntimeConstructedRuntimeRequest["effort"];
  policyId: string;
  profileId: string;
  status: RuntimeResult["status"];
  startedAt: string;
  completedAt: string;
  diagnosticCodes: readonly string[];
  errorCode: RuntimeErrorCode | null;
  runtimeInvoked: true;
  effectStarted: boolean;
  termination: RuntimeResult["termination"] | null;
}>;

export type PreparedInboundRuntimeExecutionResult =
  | Readonly<{
      schemaVersion: typeof PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION;
      outcome: "rejected";
      requestId: string | null;
      stage:
        | "inbound"
        | "authentication"
        | "security"
        | "preparation"
        | "execution_context"
        | "runtime_admission"
        | "runtime_resolution";
      reason: string | RuntimeExecutionAdmissionErrorCode;
    }>
  | Readonly<{
      schemaVersion: typeof PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION;
      outcome: "failed";
      requestId: string;
      stage: "runtime_execution";
      reason: "runtime_execution_failed" | "runtime_result_invalid";
    }>
  | Readonly<{
      schemaVersion: typeof PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION;
      outcome: "planned";
      requestId: string;
      plan: PreparedInboundRuntimeExecutionPlan;
    }>
  | Readonly<{
      schemaVersion: typeof PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION;
      outcome: "executed";
      requestId: string;
      receipt: PreparedInboundRuntimeExecutionReceipt;
    }>;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isOrdinaryObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  try {
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isParseableInstant(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function isRuntimeId(value: unknown): value is RuntimeId {
  return (
    value === LOCAL_PROCESS_RUNTIME_ID ||
    (typeof value === "string" &&
      AGENT_RUNTIMES.includes(value as AgentRuntime))
  );
}

function isProvider(value: unknown): value is AgentProvider {
  return (
    typeof value === "string" &&
    AGENT_PROVIDERS.includes(value as AgentProvider)
  );
}

function isValidTask(value: unknown): value is RoadmapCandidate {
  return (
    isOrdinaryObject(value) &&
    isNonEmptyString(value.path) &&
    Number.isSafeInteger(value.line) &&
    (value.line as number) > 0 &&
    isNonEmptyString(value.text) &&
    (value.kind === "safe" || value.kind === "warning" || value.kind === "blocked") &&
    isNonEmptyString(value.reason) &&
    (value.status === "todo" ||
      value.status === "in_progress" ||
      value.status === "done" ||
      value.status === "unknown") &&
    (value.priority === "p1" ||
      value.priority === "p2" ||
      value.priority === "p3" ||
      value.priority === "default")
  );
}

function isValidContextPackage(
  value: unknown,
  project: string,
): value is MinimalContextPackage {
  return (
    isOrdinaryObject(value) &&
    value.project === project &&
    isOrdinaryObject(value.budget) &&
    Array.isArray(value.files) &&
    Array.isArray(value.omitted) &&
    Number.isSafeInteger(value.totalCharacters) &&
    (value.totalCharacters as number) >= 0 &&
    Number.isSafeInteger(value.estimatedTokens) &&
    (value.estimatedTokens as number) >= 0 &&
    typeof value.truncated === "boolean"
  );
}

function isValidExecutionContext(
  context: unknown,
  request: LoopRuntimeConstructedRuntimeRequest,
): context is PreparedInboundRuntimeExecutionContext {
  if (!isOrdinaryObject(context) || !isOrdinaryObject(context.policy)) {
    return false;
  }
  const policy = context.policy;
  const selection = policy.selection;
  if (
    policy.policyId !== request.policyId ||
    policy.mode !== "execute" ||
    policy.status !== "resolved" ||
    !isOrdinaryObject(selection) ||
    selection.outcome !== "selected" ||
    !isOrdinaryObject(selection.profile) ||
    selection.profile.id !== request.profileId ||
    selection.profile.effort !== request.effort ||
    !isProvider(context.provider) ||
    selection.profile.provider !== context.provider ||
    !isValidTask(context.task) ||
    !isValidContextPackage(context.contextPackage, request.project)
  ) {
    return false;
  }
  return (
    context.localProcessExecutionPolicy === undefined ||
    isOrdinaryObject(context.localProcessExecutionPolicy)
  );
}

function isValidRuntimeResult(
  value: unknown,
  expectedRuntimeId: RuntimeId,
): value is RuntimeResult {
  if (!isOrdinaryObject(value)) return false;
  if (
    value.runtimeId !== expectedRuntimeId ||
    !RUNTIME_RESULT_STATUSES.includes(
      value.status as (typeof RUNTIME_RESULT_STATUSES)[number],
    ) ||
    !isParseableInstant(value.startedAt) ||
    !isParseableInstant(value.completedAt) ||
    !Array.isArray(value.diagnostics) ||
    !value.diagnostics.every((diagnostic) => typeof diagnostic === "string")
  ) {
    return false;
  }
  if (value.error === undefined) return true;
  return (
    isOrdinaryObject(value.error) &&
    RUNTIME_ERROR_CODES.includes(
      value.error.code as (typeof RUNTIME_ERROR_CODES)[number],
    ) &&
    typeof value.error.processStarted === "boolean"
  );
}

function rejection(
  requestId: string | null,
  stage: Extract<
    PreparedInboundRuntimeExecutionResult,
    { outcome: "rejected" }
  >["stage"],
  reason: string | RuntimeExecutionAdmissionErrorCode,
): PreparedInboundRuntimeExecutionResult {
  return deepFreeze({
    schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
    outcome: "rejected" as const,
    requestId,
    stage,
    reason,
  });
}

function failure(
  requestId: string,
  reason: "runtime_execution_failed" | "runtime_result_invalid",
): PreparedInboundRuntimeExecutionResult {
  return deepFreeze({
    schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
    outcome: "failed" as const,
    requestId,
    stage: "runtime_execution" as const,
    reason,
  });
}

function runtimeRequestFromPrepared(
  prepared: LoopRuntimeConstructedRuntimeRequest,
  context: PreparedInboundRuntimeExecutionContext,
  requestId: string,
  evaluatedAt: string,
): RuntimeRequest | null {
  if (!isRuntimeId(prepared.runtimeId)) return null;
  const localProcess = prepared.runtimeId === LOCAL_PROCESS_RUNTIME_ID;
  const executionPolicy = context.localProcessExecutionPolicy;
  if (
    prepared.mode === "execute" &&
    localProcess &&
    (executionPolicy === undefined || prepared.command.cwd === undefined)
  ) {
    return null;
  }
  if (!localProcess && executionPolicy !== undefined) return null;

  return deepFreeze({
    task: context.task,
    mode: context.policy.mode,
    contextPackage: context.contextPackage,
    resolvedAgentPolicy: context.policy,
    provider: context.provider,
    effort: prepared.effort,
    requestedAt: evaluatedAt,
    metadata: {
      requestId,
      project: prepared.project,
      ...(prepared.cycleId === undefined ? {} : { cycleId: prepared.cycleId }),
    },
    requestedRuntime: prepared.runtimeId,
    ...(context.policy.requirements.allowedProviders === undefined
      ? {}
      : { allowedProviders: context.policy.requirements.allowedProviders }),
    ...(context.policy.requirements.allowedRuntimes === undefined
      ? {}
      : { allowedRuntimes: context.policy.requirements.allowedRuntimes }),
    ...(prepared.mode !== "execute" || !localProcess
      ? {}
      : {
          localProcess: {
            command: {
              executable: prepared.command.executable,
              args: prepared.command.arguments,
              cwd: prepared.command.cwd as string,
              stdin: null,
            },
            executionPolicy: executionPolicy as LocalProcessExecutionPolicy,
          },
        }),
  }) as RuntimeRequest;
}

function createPlan(
  requestId: string,
  evaluatedAt: string,
  request: LoopRuntimeConstructedRuntimeRequest,
  runtimeId: RuntimeId,
  provider: AgentProvider,
): PreparedInboundRuntimeExecutionPlan {
  return deepFreeze({
    schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
    requestId,
    project: request.project,
    cycleId: request.cycleId ?? null,
    mode: "dry-run" as const,
    runtimeId,
    provider,
    effort: request.effort,
    policyId: request.policyId,
    profileId: request.profileId,
    evaluatedAt,
    limits: request.limits,
  });
}

function didEffectStart(result: RuntimeResult): boolean {
  return (
    result.error?.processStarted === true ||
    (result.events?.some((event) => event.type === "process_started") ?? false)
  );
}

function createReceipt(
  requestId: string,
  request: LoopRuntimeConstructedRuntimeRequest,
  runtimeId: RuntimeId,
  provider: AgentProvider,
  result: RuntimeResult,
): PreparedInboundRuntimeExecutionReceipt {
  return deepFreeze({
    schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
    requestId,
    project: request.project,
    cycleId: request.cycleId ?? null,
    runtimeId,
    provider,
    effort: request.effort,
    policyId: request.policyId,
    profileId: request.profileId,
    status: result.status,
    startedAt: result.startedAt,
    completedAt: result.completedAt,
    diagnosticCodes: result.error ? [result.error.code] : [],
    errorCode: result.error?.code ?? null,
    runtimeInvoked: true as const,
    effectStarted: didEffectStart(result),
    termination: result.termination ?? null,
  });
}

async function resolveExecutionContext(
  resolver: PreparedInboundRuntimeExecutionContextResolver,
  input: Readonly<{
    requestId: string;
    evaluatedAt: string;
    request: LoopRuntimeConstructedRuntimeRequest;
  }>,
): Promise<PreparedInboundRuntimeExecutionContextResolution> {
  try {
    const resolution = await resolver.resolve(input);
    if (!isOrdinaryObject(resolution) || typeof resolution.resolved !== "boolean") {
      return deepFreeze({ resolved: false as const, reason: "execution_context_invalid" as const });
    }
    if (!resolution.resolved) {
      return resolution.reason === "execution_context_unavailable"
        ? deepFreeze(resolution)
        : deepFreeze({ resolved: false as const, reason: "execution_context_invalid" as const });
    }
    return isValidExecutionContext(resolution.context, input.request)
      ? deepFreeze(resolution)
      : deepFreeze({ resolved: false as const, reason: "execution_context_invalid" as const });
  } catch {
    return deepFreeze({ resolved: false as const, reason: "execution_context_unavailable" as const });
  }
}

function resolveAdapter(
  resolver: PreparedInboundRuntimeResolver,
  request: RuntimeRequest,
): RuntimeSelectionResult {
  try {
    return resolver(request);
  } catch {
    return deepFreeze({ outcome: "unsupported" as const, reason: "runtime resolver failed" });
  }
}

async function invokeAdapter(
  adapter: RuntimeAdapter,
  request: RuntimeRequest,
): Promise<RuntimeResult | null> {
  try {
    return await adapter.execute(request);
  } catch {
    return null;
  }
}

export async function executePreparedInboundRuntimeRequest(
  envelope: InboundLoopRuntimeRequestEnvelope,
  dependencies: PreparedInboundRuntimeExecutionDependencies,
): Promise<PreparedInboundRuntimeExecutionResult> {
  const inbound = await handleInboundLoopRuntimeRequest(envelope, dependencies);

  if (inbound.outcome === "invalid") {
    return rejection(null, "inbound", inbound.reason);
  }
  if (inbound.outcome === "rejected") {
    if (inbound.stage === "authentication") {
      return rejection(envelope.requestId, "authentication", inbound.reason);
    }
    const reason =
      inbound.decision.kind === "allow"
        ? "insufficient_evidence"
        : inbound.decision.reason;
    return rejection(envelope.requestId, "security", reason);
  }
  if (!inbound.prepared.prepared) {
    return rejection(
      envelope.requestId,
      "preparation",
      `${inbound.prepared.stage}:${inbound.prepared.reason}`,
    );
  }

  const prepared = inbound.prepared.request;
  const contextResolution = await resolveExecutionContext(
    dependencies.executionContextResolver,
    { requestId: envelope.requestId, evaluatedAt: envelope.evaluatedAt, request: prepared },
  );
  if (!contextResolution.resolved) {
    return rejection(envelope.requestId, "execution_context", contextResolution.reason);
  }

  const runtimeRequest = runtimeRequestFromPrepared(
    prepared,
    contextResolution.context,
    envelope.requestId,
    envelope.evaluatedAt,
  );
  if (!runtimeRequest || !isRuntimeId(prepared.runtimeId)) {
    return rejection(envelope.requestId, "execution_context", "execution_context_invalid");
  }

  const admission = evaluateRuntimeExecutionAdmission({
    runtimeId: prepared.runtimeId,
    policy: contextResolution.context.policy,
    provider: contextResolution.context.provider,
    effort: prepared.effort,
    budget: prepared.limits as Partial<AgentBudget>,
  });
  if (!admission.admitted) {
    return rejection(envelope.requestId, "runtime_admission", admission.reason);
  }

  const selection = resolveAdapter(
    dependencies.runtimeResolver ?? resolveRuntime,
    runtimeRequest,
  );
  if (selection.outcome !== "selected") {
    return rejection(envelope.requestId, "runtime_resolution", "runtime_unavailable");
  }

  if (prepared.mode === "dry-run") {
    const plan = createPlan(
      envelope.requestId,
      envelope.evaluatedAt,
      prepared,
      prepared.runtimeId,
      contextResolution.context.provider,
    );
    return deepFreeze({
      schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
      outcome: "planned" as const,
      requestId: envelope.requestId,
      plan,
    });
  }

  const runtimeResult = await invokeAdapter(selection.adapter, runtimeRequest);
  if (runtimeResult === null) {
    return failure(envelope.requestId, "runtime_execution_failed");
  }
  if (!isValidRuntimeResult(runtimeResult, prepared.runtimeId)) {
    return failure(envelope.requestId, "runtime_result_invalid");
  }

  const receipt = createReceipt(
    envelope.requestId,
    prepared,
    prepared.runtimeId,
    contextResolution.context.provider,
    runtimeResult,
  );
  return deepFreeze({
    schemaVersion: PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
    outcome: "executed" as const,
    requestId: envelope.requestId,
    receipt,
  });
}
