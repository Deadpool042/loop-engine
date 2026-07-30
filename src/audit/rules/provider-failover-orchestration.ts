import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AuditContext, AuditFinding, AuditRule } from "../types.js";

const REQUIRED_TOKENS = [
  "executeLoopProviderFailover",
  "createProviderFailoverLoopExecutor",
  "provider_attempt_duplicate",
  "provider_primary_plan_mismatch",
  "LOOP_PROVIDER_FAILOVER_SCHEMA_VERSION",
] as const;

export function createProviderFailoverOrchestrationRule(): AuditRule {
  return {
    id: "AUDIT-503",
    name: "Provider failover orchestration contract",
    description:
      "Ensures bounded provider failover preserves plan/executor identity, duplicate rejection and public evidence.",
    stability: "stable",
    tags: ["architecture", "execution", "providers"],
    run(context: AuditContext): AuditFinding {
      const path = join(context.rootDir, "src/loop/provider-failover.ts");
      let source: string;
      try {
        source = readFileSync(path, "utf8");
      } catch {
        return {
          ruleId: "AUDIT-503",
          status: "fail",
          message: "Provider failover orchestration module is missing.",
          details: [path],
        };
      }

      const missing = REQUIRED_TOKENS.filter((token) => !source.includes(token));
      return missing.length === 0
        ? {
            ruleId: "AUDIT-503",
            status: "pass",
            message: "Provider failover orchestration contract is present.",
            details: [],
          }
        : {
            ruleId: "AUDIT-503",
            status: "fail",
            message: "Provider failover orchestration contract is incomplete.",
            details: missing.map((token) => `Missing token: ${token}`),
          };
    },
  };
}
