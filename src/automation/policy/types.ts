/**
 * V18.5 public Automation Policy contracts.
 *
 * This package is provider-, forge-, and runtime-agnostic and contains
 * declarations only. It does not implement policy evaluation, a rules engine,
 * or any I/O, process, network, or filesystem operation.
 */

import type {
  AutomationCapability,
  AutomationContext,
  AutomationMetadata,
  AutomationRequest,
} from "../types.js";

export type AutomationPolicyId = string;

export type AutomationPolicyCapability = AutomationCapability;

export type AutomationPolicyMetadata = Readonly<{
  schemaVersion: 1;
  policyId: AutomationPolicyId;
  labels: readonly string[];
  attributes: Readonly<Record<string, string>>;
}>;

export type AutomationPolicyContext = Readonly<{
  context: AutomationContext;
  metadata: AutomationPolicyMetadata;
}>;

export type AutomationPolicyRequest = Readonly<{
  requestId: string;
  automationRequest: AutomationRequest;
  context: AutomationPolicyContext;
  metadata: AutomationPolicyMetadata;
}>;

export type AutomationPolicyDecision = Readonly<{
  status: "allowed" | "denied";
  policyId: AutomationPolicyId;
  capability: AutomationPolicyCapability;
  reason: string;
  metadata: AutomationPolicyMetadata;
}>;

export type AutomationPolicyError = Readonly<{
  code:
    | "invalid_request"
    | "unsupported_capability"
    | "policy_unavailable"
    | "context_invalid"
    | "decision_invalid"
    | "internal_error";
  message: string;
  metadata: AutomationPolicyMetadata;
}>;

export type AutomationPolicyResult =
  | Readonly<{
      status: "allowed" | "denied";
      decision: AutomationPolicyDecision;
      error: null;
      metadata: AutomationPolicyMetadata;
    }>
  | Readonly<{
      status: "failed";
      decision: null;
      error: AutomationPolicyError;
      metadata: AutomationPolicyMetadata;
    }>;

/**
 * Declarative policy description. Evaluation remains the responsibility of an
 * implementation outside this contract package.
 */
export interface AutomationPolicy {
  readonly id: AutomationPolicyId;
  readonly capabilities: readonly AutomationPolicyCapability[];
  readonly metadata: AutomationPolicyMetadata;
}

/**
 * Deterministic policy-evaluation port. This interface supplies no evaluator
 * implementation, rules engine, or dependency-injection container.
 */
export interface AutomationPolicyEvaluator {
  evaluate(
    request: AutomationPolicyRequest,
    policy: AutomationPolicy,
  ): AutomationPolicyResult;
}
