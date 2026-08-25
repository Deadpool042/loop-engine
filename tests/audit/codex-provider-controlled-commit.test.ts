import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";
import {
  CODEX_PROVIDER_CONTROLLED_COMMIT_RULE,
  inspectCodexProviderControlledCommitInvariant,
} from "../../src/audit/rules/codex-provider-controlled-commit.js";

describe("Codex provider controlled commit audit", () => {
  it("registers AUDIT-497 and passes against the delivered boundary", () => {
    assert.equal(CODEX_PROVIDER_CONTROLLED_COMMIT_RULE.id, "AUDIT-497");
    assert.equal(
      AUDIT_RULES.some((rule) => rule.id === "AUDIT-497"),
      true,
    );
    assert.equal(CODEX_PROVIDER_CONTROLLED_COMMIT_RULE.check().status, "pass");
  });

  it("accepts typed provider dispatch and detects publication effects", () => {
    const result = inspectCodexProviderControlledCommitInvariant(
      'basename(options.executable.trim()) !== "codex"\\nreturn async (plan)\\n"--sandbox"\\n"workspace-write"\\n"--json"\\nplan.provider !== "openai" || plan.runtime !== "codex"\\nshell: false\\nmaxOutputBytes\\nworktree_not_clean\\nchild.kill("SIGTERM")\\nfetch(',
      '["add", "--", ...files]\\n["commit", "--no-verify", "-m", message, "--", ...files]\\n["rev-parse", "HEAD"]\\nisSafeRelativePath\\ngit push',
      'execution.validation?.status !== "passed"\\n"nothing_to_commit"\\noptions.committer ?? gitLoopCommitter\\nmode: "commit" as const\\npublication: null',
      'provider?: LoopProviderId\\n"missing_provider_executable"\\n"missing_commit_message"\\nawait runLoopCommit(\\nawait runLoopPublish(',
      "# Codex Provider Pilot and Controlled Commit Mode",
    );

    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.forbidden, ["git push", "fetch("]);
  });
});
