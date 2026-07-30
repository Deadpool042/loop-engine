import { runLoopExecute, type LoopRunExecuteOptions } from "./execute-runner.js";
import type { LoopExecutor } from "./execution.js";
import { fingerprintLoopProviderFailoverEvidence } from "./provider-failover-evidence-integrity.js";
import type { LoopProviderFailoverEvidence } from "./provider-failover.js";
import type { LoopRunResult } from "./types.js";

/**
 * Runs execute mode while preserving optional bounded provider failover evidence.
 * The underlying runner remains unchanged; this facade captures evidence only
 * from the injected executor result and attaches its integrity fingerprint.
 */
export async function runLoopExecuteWithProviderFailoverEvidence(
  projectName: string,
  options: LoopRunExecuteOptions = {},
): Promise<LoopRunResult> {
  let evidence: LoopProviderFailoverEvidence | null = null;
  const executor = options.executor;
  const evidenceAwareExecutor: LoopExecutor | undefined =
    executor === undefined
      ? undefined
      : async (plan) => {
          const result = await executor(plan);
          evidence = result.providerFailoverEvidence ?? null;
          return result;
        };

  const result = await runLoopExecute(projectName, {
    ...options,
    ...(evidenceAwareExecutor === undefined
      ? {}
      : { executor: evidenceAwareExecutor }),
  });

  return Object.freeze({
    ...result,
    providerFailoverEvidence: evidence,
    providerFailoverFingerprint:
      evidence === null ? null : fingerprintLoopProviderFailoverEvidence(evidence),
  });
}
