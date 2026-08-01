/**
 * V18.2 public Automation Platform contracts.
 *
 * These declarations are provider- and forge-agnostic. They describe stable,
 * immutable data relationships only; they do not perform automation, dispatch,
 * validation, provider selection, or external I/O.
 */

export type AutomationCapability =
  "review" | "validation" | "release" | "documentation" | "coordination";

export type AutomationMetadata = Readonly<{
  schemaVersion: 1;
  correlationId: string;
  createdAt: string;
  labels: readonly string[];
  attributes: Readonly<Record<string, string>>;
}>;

export type AutomationContext = Readonly<{
  scopeId: string;
  subjectId: string;
  metadata: AutomationMetadata;
}>;

export type AutomationRequest = Readonly<{
  requestId: string;
  capability: AutomationCapability;
  context: AutomationContext;
  metadata: AutomationMetadata;
}>;

export type AutomationJob = Readonly<{
  jobId: string;
  request: AutomationRequest;
  metadata: AutomationMetadata;
}>;

export type AutomationError = Readonly<{
  code:
    | "invalid_request"
    | "unsupported_capability"
    | "policy_denied"
    | "context_invalid"
    | "job_not_found"
    | "execution_rejected"
    | "internal_error";
  message: string;
  metadata: AutomationMetadata;
}>;

export type AutomationExecution = Readonly<{
  executionId: string;
  job: AutomationJob;
  status: "accepted" | "rejected" | "completed" | "failed";
  metadata: AutomationMetadata;
}>;

export type AutomationResult =
  | Readonly<{
      status: "accepted" | "completed";
      execution: AutomationExecution;
      error: null;
      metadata: AutomationMetadata;
    }>
  | Readonly<{
      status: "rejected" | "failed";
      execution: AutomationExecution | null;
      error: AutomationError;
      metadata: AutomationMetadata;
    }>;

/**
 * Declarative public description of an Automation Platform instance.
 * Implementations, provider ports, forge ports, policy engines, Audit, and CI
 * remain outside this contract package.
 */
export interface AutomationPlatform {
  readonly platformId: string;
  readonly capabilities: readonly AutomationCapability[];
  readonly metadata: AutomationMetadata;
}
