import { existsSync, readFileSync } from "node:fs";

import { fail, pass } from "../findings.js";
import { sourceIncludesToken } from "../source.js";
import type { AuditRuleDefinition as AuditRule } from "../types.js";

const PROVIDER_FILE = "src/loop/codex-cli-executor.ts";
const COMMITTER_FILE = "src/loop/git-committer.ts";
const COMMIT_RUNNER_FILE = "src/loop/commit-runner.ts";
const COMMAND_FILE = "src/commands/run.ts";
const ARCHITECTURE_FILE =
  "docs/architecture/codex-provider-controlled-commit.md";

const REQUIRED_PROVIDER_TOKENS = Object.freeze([
  'basename(options.executable.trim()) !== "codex"',
  "return async (plan)",
  '"--sandbox"',
  '"workspace-write"',
  '"--json"',
  'plan.provider !== "openai" || plan.runtime !== "codex"',
  "shell: false",
  "maxOutputBytes",
  "worktree_not_clean",
  'child.kill("SIGTERM")',
]);
const REQUIRED_COMMITTER_TOKENS = Object.freeze([
  '["add", "--", ...files]',
  '["commit", "--no-verify", "-m", message, "--", ...files]',
  '["rev-parse", "HEAD"]',
  "isSafeRelativePath",
]);
const REQUIRED_RUNNER_TOKENS = Object.freeze([
  'execution.validation?.status !== "passed"',
  '"nothing_to_commit"',
  "options.committer ?? gitLoopCommitter",
  'mode: "commit" as const',
  "publication: null",
]);
const REQUIRED_COMMAND_TOKENS = Object.freeze([
  "provider?: LoopProviderId",
  '"missing_provider_executable"',
  '"missing_commit_message"',
  "await runLoopCommit(",
  "await runLoopPublish(",
]);
const FORBIDDEN_TOKENS = Object.freeze([
  "--full-auto",
  "git push",
  "git tag",
  "reset --hard",
  "force: true",
  "createServer(",
  "fetch(",
]);

export function inspectCodexProviderControlledCommitInvariant(
  providerSource: string,
  committerSource: string,
  runnerSource: string,
  commandSource: string,
  architectureSource: string,
): Readonly<{ missing: readonly string[]; forbidden: readonly string[] }> {
  const missing = [
    ...REQUIRED_PROVIDER_TOKENS.filter(
      (token) => !sourceIncludesToken(providerSource, token),
    ).map((token) => `${PROVIDER_FILE} -> missing: ${token}`),
    ...REQUIRED_COMMITTER_TOKENS.filter(
      (token) => !sourceIncludesToken(committerSource, token),
    ).map((token) => `${COMMITTER_FILE} -> missing: ${token}`),
    ...REQUIRED_RUNNER_TOKENS.filter(
      (token) => !sourceIncludesToken(runnerSource, token),
    ).map((token) => `${COMMIT_RUNNER_FILE} -> missing: ${token}`),
    ...REQUIRED_COMMAND_TOKENS.filter(
      (token) => !sourceIncludesToken(commandSource, token),
    ).map((token) => `${COMMAND_FILE} -> missing: ${token}`),
    ...(!sourceIncludesToken(
      architectureSource,
      "# Codex Provider Pilot and Controlled Commit Mode",
    )
      ? [`${ARCHITECTURE_FILE} -> missing architecture contract`]
      : []),
  ];
  const combined = [
    providerSource,
    committerSource,
    runnerSource,
    commandSource,
  ].join("\n");
  const forbidden = FORBIDDEN_TOKENS.filter((token) =>
    sourceIncludesToken(combined, token),
  );
  return Object.freeze({
    missing: Object.freeze(missing),
    forbidden: Object.freeze(forbidden),
  });
}

export const CODEX_PROVIDER_CONTROLLED_COMMIT_RULE: AuditRule = (() => {
  const rule: AuditRule = {
    id: "AUDIT-497",
    category: "architecture",
    severity: "error",
    title: "Codex provider and controlled commit remain bounded and explicit",
    description:
      "The Codex pilot must consume one prebuilt execution plan directly, select only an explicit Codex CLI executable, start from a clean worktree, bound and redact provider execution, validate before commit, commit only exact safe files, never push, and keep candidate publication outside controlled commit.",
    metadata: {
      introducedIn: "V14.6",
      tags: ["architecture", "contract", "execution", "policy", "ci"],
      stability: "stable",
      dependsOn: ["AUDIT-495"],
    },
    check: () => {
      const read = (path: string): string =>
        existsSync(path) ? readFileSync(path, "utf8") : "";
      const result = inspectCodexProviderControlledCommitInvariant(
        read(PROVIDER_FILE),
        read(COMMITTER_FILE),
        read(COMMIT_RUNNER_FILE),
        read(COMMAND_FILE),
        read(ARCHITECTURE_FILE),
      );
      const details = [
        ...result.missing,
        ...result.forbidden.map(
          (token) => `V14.6 boundary -> forbidden: ${token}`,
        ),
      ];
      return details.length > 0
        ? fail(
            rule,
            `${rule.title}.`,
            details,
            "Keep the Codex provider bound to one prebuilt execution plan and one validation-gated exact-file Git commit; retain clean-worktree, shell-false, limits, redaction, no-push and separate-publication guarantees.",
          )
        : pass(
            rule,
            `${rule.title}.`,
            Object.freeze([
              PROVIDER_FILE,
              COMMITTER_FILE,
              COMMIT_RUNNER_FILE,
              COMMAND_FILE,
              ARCHITECTURE_FILE,
            ]),
          );
    },
  };
  return rule;
})();
