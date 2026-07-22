import type { AuditProfile, AuditReport } from "../audit/types.js";
import type { AuditRuleSelection } from "../audit/registry.js";
import type { LoopRunResult } from "../loop/types.js";
import type { ProjectSnapshot } from "../intelligence/snapshot.js";
import type {
  RuntimeExecution,
  RuntimeRequest,
  RuntimeResult,
} from "../runtime/types.js";
import type {
  ProviderExecutionPlan,
  ProviderRequest,
  ProviderResult,
} from "../providers/types.js";
import type { TransportAdapterRequest, TransportResult } from "../transports/types.js";

/** Stable options accepted by the public Core audit API. */
export type CoreAuditOptions = Readonly<{
  profile?: AuditProfile;
  selection?: AuditRuleSelection;
}>;

/** Stable JSON-shaped reports exposed by the Core. */
export type CoreAuditReport = AuditReport;
export type CoreExecutionReport = Omit<LoopRunResult, "schemaVersion"> & {
  schemaVersion: 1;
};
export type CoreProjectReport = ProjectSnapshot;
export type CoreRuntimeRequest = RuntimeRequest;
export type CoreRuntimeResult = RuntimeResult;
export type CoreRuntimeExecution = RuntimeExecution;
export type CoreProviderRequest = ProviderRequest;
export type CoreProviderExecutionPlan = ProviderExecutionPlan;
export type CoreProviderResult = ProviderResult;
export type CoreTransportAdapterRequest = TransportAdapterRequest;
export type CoreTransportResult = TransportResult;

export type {
  AuditProfile,
  AuditReport,
  AuditRuleSelection,
  LoopRunResult,
  ProjectSnapshot,
  RuntimeRequest,
  RuntimeResult,
  RuntimeExecution,
  ProviderRequest,
  ProviderExecutionPlan,
  ProviderResult,
  TransportAdapterRequest,
  TransportResult,
};
