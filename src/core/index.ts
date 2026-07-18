/** Stable internal integration boundary for CLI and future adapters. */
export * from "./audit.js";
export * from "./loop.js";
export * from "./runtime.js";
export * from "./providers.js";
export * from "./transports.js";
export * from "./reports.js";
export * from "./types.js";

export { loadConfig, type Config, type ProjectConfig } from "./config.js";
export { findProject, getRequiredProjectName } from "./project.js";
export { isAuditProfile } from "../audit/profiles.js";
export {
  isAuditRuleStability,
  isAuditRuleTag,
  type AuditRuleSelection,
} from "../audit/registry.js";
export { LOOP_RUN_MODES, type LoopRunMode } from "../loop/types.js";
