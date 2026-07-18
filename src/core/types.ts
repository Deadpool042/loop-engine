import type { AuditProfile, AuditReport } from "../audit/types.js";
import type { AuditRuleSelection } from "../audit/registry.js";
import type { LoopRunResult } from "../loop/types.js";
import type { ProjectSnapshot } from "../intelligence/snapshot.js";

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

export type {
  AuditProfile,
  AuditReport,
  AuditRuleSelection,
  LoopRunResult,
  ProjectSnapshot,
};
