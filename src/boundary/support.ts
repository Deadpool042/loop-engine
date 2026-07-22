import type { DispatchDescriptorResult } from "../dispatch/types.js";
import { freezeReviewArchitectureValue } from "../review-architecture/shared.js";
import type {
  BoundaryHandoff,
  BoundaryHandoffEvidence,
  BoundaryHandoffMetadata,
  BoundaryHandoffStatus,
  BoundaryHandoffSummary,
} from "./types.js";

const RFC_VERSION = "rfc-execution-boundary-v12" as const;

export function freezeBoundaryHandoffValue<T>(value: T): T {
  return freezeReviewArchitectureValue(value);
}

export function boundaryHandoffIdFor(
  descriptor: DispatchDescriptorResult | null,
): string {
  return `boundary-handoff.${descriptor?.descriptor.id ?? "missing"}`;
}

function emptyEvidence(): BoundaryHandoffEvidence {
  return freezeBoundaryHandoffValue({
    descriptorId: "",
    authorityId: "",
    eligibilityId: "",
    reviewId: "",
    provenanceId: "",
    policyVersion: "",
    configurationVersion: "",
    mappingVersion: "",
    protocolVersion: "",
    runtimeContractVersion: "",
    transportContractVersion: "",
    architectureRfcVersion: RFC_VERSION,
    executionStarted: false,
  });
}

export function evidenceFor(
  descriptor: DispatchDescriptorResult | null,
): BoundaryHandoffEvidence {
  if (!descriptor) return emptyEvidence();
  const evidence = descriptor.descriptor.evidence;
  return freezeBoundaryHandoffValue({
    descriptorId: descriptor.descriptor.id,
    authorityId: evidence.authorityId,
    eligibilityId: evidence.eligibilityId,
    reviewId: evidence.reviewId,
    provenanceId: evidence.provenanceId,
    policyVersion: evidence.policyVersion,
    configurationVersion: evidence.configurationVersion,
    mappingVersion: evidence.mappingVersion,
    protocolVersion: evidence.protocolVersion,
    runtimeContractVersion: evidence.runtimeContractVersion,
    transportContractVersion: evidence.transportContractVersion,
    architectureRfcVersion: evidence.architectureRfcVersion,
    executionStarted: false,
  });
}

export function metadataFor(
  descriptor: DispatchDescriptorResult | null,
): BoundaryHandoffMetadata {
  return freezeBoundaryHandoffValue({
    ...(descriptor?.metadata ?? {}),
    boundary: "declarative",
  });
}

export function buildBoundaryHandoff(
  descriptor: DispatchDescriptorResult | null,
  status: BoundaryHandoffStatus = "validated",
): BoundaryHandoff {
  return freezeBoundaryHandoffValue({
    id: boundaryHandoffIdFor(descriptor),
    status,
    evidence: evidenceFor(descriptor),
    metadata: metadataFor(descriptor),
    diagnostics: freezeBoundaryHandoffValue([]),
    ready: false,
    accepted: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });
}

export function summarizeBoundaryHandoff(
  handoff: BoundaryHandoff,
): BoundaryHandoffSummary {
  return freezeBoundaryHandoffValue({
    descriptorReferenced: handoff.evidence.descriptorId.length > 0,
    authorityReferenced: handoff.evidence.authorityId.length > 0,
    eligibilityReferenced: handoff.evidence.eligibilityId.length > 0,
    reviewReferenced: handoff.evidence.reviewId.length > 0,
    policyReferenced: handoff.evidence.policyVersion.length > 0,
    evidenceComplete:
      handoff.evidence.descriptorId.length > 0 &&
      handoff.evidence.authorityId.length > 0 &&
      handoff.evidence.eligibilityId.length > 0 &&
      handoff.evidence.reviewId.length > 0 &&
      handoff.evidence.policyVersion.length > 0,
    diagnosticsCount: handoff.diagnostics.length,
    ready: false,
    accepted: false,
    dispatchable: false,
    executable: false,
  });
}

export const OpenClawBoundaryHandoffFixture: BoundaryHandoff =
  freezeBoundaryHandoffValue({
    id: "boundary-handoff.dispatch-descriptor.handoff-eligibility.execution-review.transport-request.openclaw.plan",
    status: "inactive",
    evidence: {
      descriptorId:
        "dispatch-descriptor.handoff-eligibility.execution-review.transport-request.openclaw.plan",
      authorityId:
        "execution-authority.handoff-eligibility.execution-review.transport-request.openclaw.plan",
      eligibilityId:
        "handoff-eligibility.execution-review.transport-request.openclaw.plan",
      reviewId: "execution-review.transport-request.openclaw.plan",
      provenanceId:
        "approval-provenance.execution-review.transport-request.openclaw.plan",
      policyVersion: "default-deny/v1",
      configurationVersion: "openclaw-plan-review/v1",
      mappingVersion: "loop-engine-openclaw-planning/v1",
      protocolVersion: "loop-engine-openclaw-planning/v1",
      runtimeContractVersion: "openclaw/v1",
      transportContractVersion: "local-process/v1",
      architectureRfcVersion: RFC_VERSION,
      executionStarted: false,
    },
    metadata: { fixture: "openclaw-boundary-handoff" },
    diagnostics: [],
    ready: false,
    accepted: false,
    dispatchable: false,
    executable: false,
    executionStarted: false,
  });

export const ClaudeBoundaryHandoffFixture: BoundaryHandoff =
  freezeBoundaryHandoffValue({
    ...OpenClawBoundaryHandoffFixture,
    id: "boundary-handoff.claude.inactive",
    status: "inactive",
    evidence: {
      ...OpenClawBoundaryHandoffFixture.evidence,
      descriptorId: "dispatch-descriptor.claude.inactive",
      authorityId: "execution-authority.claude.inactive",
      eligibilityId: "handoff-eligibility.claude.inactive",
      reviewId: "execution-review.claude.inactive",
      provenanceId: "approval-provenance.claude.inactive",
      runtimeContractVersion: "claude/v1",
    },
    metadata: { fixture: "claude-boundary-handoff" },
  });

export const CodexBoundaryHandoffFixture: BoundaryHandoff =
  freezeBoundaryHandoffValue({
    ...OpenClawBoundaryHandoffFixture,
    id: "boundary-handoff.codex.inactive",
    status: "inactive",
    evidence: {
      ...OpenClawBoundaryHandoffFixture.evidence,
      descriptorId: "dispatch-descriptor.codex.inactive",
      authorityId: "execution-authority.codex.inactive",
      eligibilityId: "handoff-eligibility.codex.inactive",
      reviewId: "execution-review.codex.inactive",
      provenanceId: "approval-provenance.codex.inactive",
      runtimeContractVersion: "codex/v1",
    },
    metadata: { fixture: "codex-boundary-handoff" },
  });
