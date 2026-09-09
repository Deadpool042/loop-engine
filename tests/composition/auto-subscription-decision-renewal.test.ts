import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import {
  AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
  AUTO_SUBSCRIPTION_DECISION_MODEL,
  ensureAutoSubscriptionExecutionDecision,
} from "../../src/composition/auto-subscription-decision-renewal.js";
import { parseExecutionDecisionFile } from "../../src/governance/execution-decision.js";

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fixture(
  options: {
    detail?: boolean;
    writeScope?: boolean;
    candidateText?: string;
    codeScope?: boolean;
    codeScopePath?: string;
  } = {},
): {
  root: string;
  project: ProjectConfig;
  head: string;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-auto-decision-"));
  const candidateText = options.candidateText ?? "Finish bounded continuation.";
  mkdirSync(join(root, "docs", "roadmap"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".loop-engine/\n", "utf8");
  writeFileSync(join(root, "OBJECTIVE.md"), "# Objective\n\nKeep the workflow governed.\n", "utf8");
  writeFileSync(
    join(root, "docs", "roadmap", "README.md"),
    options.detail === false
      ? `# Roadmap\n\n- [ ] H1-L1 — ${candidateText}\n`
      : `# Roadmap\n\n- [ ] H1-L1 — ${candidateText} [Détail](./h1-l1.md)\n`,
    "utf8",
  );
  if (options.detail !== false) {
    writeFileSync(
      join(root, "docs", "roadmap", "h1-l1.md"),
      [
        "# H1-L1 — Finish bounded continuation",
        "",
        "## Objectif",
        "",
        "Document the bounded continuation result.",
        "",
        "## Critères de fin",
        "",
        "- Add docs/continuation-proof.md.",
        "- Mark H1-L1 complete in docs/roadmap/README.md.",
        "",
        ...(options.writeScope === false
          ? []
          : [
              "## Périmètre d’écriture",
              "",
              ...(options.codeScope
                ? [`- \`${options.codeScopePath ?? "src/example.ts"}\``]
                : ["- `docs/continuation-proof.md`"]),
              "- `docs/roadmap/README.md`",
              "",
            ]),
        "## Hors périmètre",
        "",
        "- No deployment.",
        "- No provider configuration.",
      ].join("\n"),
      "utf8",
    );
  }

  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  const head = git(root, ["rev-parse", "HEAD"]);

  const project: ProjectConfig = {
    name: "example",
    path: root,
    repository: "example/example",
    type: "node-cli",
    required_docs: [],
    validation: ["pnpm run validate"],
    planning: { mode: "roadmap", objective_source: "OBJECTIVE.md" },
    roadmap: ["docs/roadmap/README.md"],
    execution_decision: ".loop-engine/execution-decision.yaml",
  };
  return { root, project, head };
}

function readyDecision(head: string): string {
  return [
    "version: 1",
    "project: example",
    "decision:",
    "  state: READY",
    "  candidate:",
    "    id: H1-L1",
    "    allowedPaths:",
    "      - docs/continuation-proof.md",
    "      - docs/roadmap/README.md",
    "  brief:",
    "    objective: Document the bounded continuation result.",
    "    deliverables:",
    "      - Add docs/continuation-proof.md.",
    "      - Mark H1-L1 complete.",
    "    outOfScope:",
    "      - No deployment.",
    "source:",
    "  document: docs/roadmap/README.md",
    `  gitHead: ${head}`,
    "",
  ].join("\n");
}

function claudeSuccess(proposal?: Record<string, unknown>) {
  return {
    exitCode: 0,
    timedOut: false,
    outputLimited: false,
    stdout: JSON.stringify({
      subtype: "success",
      structured_output:
        proposal ?? {
          objective: "Document the bounded continuation result.",
          deliverables: [
            "Add docs/continuation-proof.md.",
            "Mark H1-L1 complete in docs/roadmap/README.md.",
          ],
          outOfScope: ["No deployment.", "No provider configuration."],
          allowedPaths: [
            "docs/continuation-proof.md",
            "docs/roadmap/README.md",
          ],
        },
    }),
  } as const;
}

function claudeTimeout() {
  return {
    exitCode: null,
    timedOut: true,
    outputLimited: false,
    stdout: "",
  } as const;
}

test("reuses a fresh SHA-bound decision without calling Claude", async () => {
  const { root, project, head } = fixture();
  try {
    mkdirSync(join(root, ".loop-engine"), { recursive: true });
    writeFileSync(
      join(root, ".loop-engine", "execution-decision.yaml"),
      readyDecision(head),
      "utf8",
    );
    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );
    assert.deepEqual(result, { ok: true, status: "reused" });
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renews a missing decision through read-only Claude subscription proposal", async () => {
  const { root, project, head } = fixture();
  try {
    let observedArgs: readonly string[] = [];
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async (args) => {
          observedArgs = args;
          return claudeSuccess();
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.status : null, "renewed");
    assert.equal(result.ok ? result.model : null, AUTO_SUBSCRIPTION_DECISION_MODEL);

    const toolIndex = observedArgs.indexOf("--tools");
    assert.ok(toolIndex >= 0);
    assert.equal(observedArgs[toolIndex + 1], "");
    assert.ok(observedArgs.includes("--restricted"));
    assert.ok(observedArgs.includes("--json-schema"));
    assert.ok(observedArgs.includes("--permission-mode"));
    assert.ok(observedArgs.includes("plan"));
    assert.ok(observedArgs.includes("--disallowedTools"));
    assert.ok(observedArgs.includes("mcp__*"));
    assert.ok(observedArgs.includes(AUTO_SUBSCRIPTION_DECISION_MODEL));

    const raw = readFileSync(
      join(root, ".loop-engine", "execution-decision.yaml"),
      "utf8",
    );
    const parsed = parseExecutionDecisionFile(raw);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.decision.project, "example");
      assert.equal(parsed.decision.source.gitHead, head);
      assert.equal(parsed.decision.decision.candidate?.id, "H1-L1");
      assert.deepEqual(parsed.decision.decision.candidate?.allowedPaths, [
        "docs/continuation-proof.md",
        "docs/roadmap/README.md",
      ]);
      assert.ok(parsed.decision.decision.brief);
    }
    assert.equal(git(root, ["status", "--short"]), "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("retries once with Sonnet when the Haiku decision proposal times out", async () => {
  const { root, project, head } = fixture();
  try {
    const observedCalls: string[][] = [];
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async (args) => {
          observedCalls.push([...args]);
          return observedCalls.length === 1 ? claudeTimeout() : claudeSuccess();
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.status : null, "renewed");
    assert.equal(
      result.ok ? result.model : null,
      AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
    );
    assert.equal(observedCalls.length, 2);

    const firstModelIndex = observedCalls[0]?.indexOf("--model") ?? -1;
    const secondModelIndex = observedCalls[1]?.indexOf("--model") ?? -1;
    assert.ok(firstModelIndex >= 0);
    assert.ok(secondModelIndex >= 0);
    assert.equal(
      observedCalls[0]?.[firstModelIndex + 1],
      AUTO_SUBSCRIPTION_DECISION_MODEL,
    );
    assert.equal(
      observedCalls[1]?.[secondModelIndex + 1],
      AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("returns a terminal timeout after Haiku and Sonnet both time out", async () => {
  const { root, project, head } = fixture();
  try {
    const observedCalls: string[][] = [];
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async (args) => {
          observedCalls.push([...args]);
          return claudeTimeout();
        },
      },
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_decision_timeout");
      assert.match(
        result.message,
        new RegExp(AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL),
      );
    }
    assert.equal(observedCalls.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a no-change economy brief and retries once with Sonnet", async () => {
  const { root, project, head } = fixture();
  try {
    const observedCalls: string[][] = [];
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async (args) => {
          observedCalls.push([...args]);
          if (observedCalls.length === 1) {
            return claudeSuccess({
              objective: "Explore the current implementation.",
              deliverables: ["Understand the existing flow."],
              outOfScope: [
                "Implementation",
                "Writing code",
                "Modifying files",
              ],
              allowedPaths: ["docs/continuation-proof.md"],
            });
          }
          return claudeSuccess();
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.status : null, "renewed");
    assert.equal(
      result.ok ? result.model : null,
      AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
    );
    assert.equal(observedCalls.length, 2);

    const firstModelIndex = observedCalls[0]?.indexOf("--model") ?? -1;
    const secondModelIndex = observedCalls[1]?.indexOf("--model") ?? -1;
    const secondEffortIndex = observedCalls[1]?.indexOf("--effort") ?? -1;
    assert.ok(firstModelIndex >= 0);
    assert.ok(secondModelIndex >= 0);
    assert.ok(secondEffortIndex >= 0);
    assert.equal(
      observedCalls[0]?.[firstModelIndex + 1],
      AUTO_SUBSCRIPTION_DECISION_MODEL,
    );
    assert.equal(
      observedCalls[1]?.[secondModelIndex + 1],
      AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
    );
    assert.equal(observedCalls[1]?.[secondEffortIndex + 1], "medium");

    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.decision.decision.brief?.outOfScope, [
        "No deployment.",
        "No provider configuration.",
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects exploration-only code briefs for code-directory globs and retries once with Sonnet", async () => {
  const { root, project, head } = fixture({
    candidateText: "Implement the bounded continuation.",
    codeScope: true,
    codeScopePath: "app/(public)/checkout/**",
  });
  try {
    const observedCalls: string[][] = [];
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async (args) => {
          observedCalls.push([...args]);
          if (observedCalls.length === 1) {
            return claudeSuccess({
              objective: "Explore the codebase.",
              deliverables: [
                "Exploration notes documenting the current implementation.",
              ],
              outOfScope: [
                "Code modifications",
                "File creation",
                "Test execution",
              ],
              allowedPaths: [
                "app/(public)/checkout/**",
                "docs/roadmap/README.md",
              ],
            });
          }
          return claudeSuccess({
            objective: "Implement the bounded continuation.",
            deliverables: [
              "Implement the bounded continuation in app/(public)/checkout/**.",
              "Update docs/roadmap/README.md.",
            ],
            outOfScope: ["No deployment."],
            allowedPaths: [
              "app/(public)/checkout/**",
              "docs/roadmap/README.md",
            ],
          });
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.status : null, "renewed");
    assert.equal(
      result.ok ? result.model : null,
      AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
    );
    assert.equal(observedCalls.length, 2);

    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.decision.decision.brief?.deliverables, [
        "Implement the bounded continuation in app/(public)/checkout/**.",
        "Update docs/roadmap/README.md.",
      ]);
      assert.deepEqual(parsed.decision.decision.brief?.outOfScope, [
        "No deployment.",
      ]);
      assert.deepEqual(parsed.decision.decision.candidate?.allowedPaths, [
        "app/(public)/checkout/**",
        "docs/roadmap/README.md",
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects planning-only briefs for noun-phrased code candidates and retries with Sonnet", async () => {
  const { root, project, head } = fixture({
    candidateText:
      "Wishlist V2 compte client : persistance serveur des favoris authentifiés et fusion idempotente des favoris visiteur.",
    codeScope: true,
  });
  try {
    const observedCalls: string[][] = [];
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async (args) => {
          observedCalls.push([...args]);
          if (observedCalls.length === 1) {
            return claudeSuccess({
              objective:
                "Clarify the current Wishlist implementation before designing the change.",
              deliverables: [
                "User responses to clarifying questions about current implementation state.",
              ],
              outOfScope: [
                "Code changes",
                "Implementation",
                "Running validation",
              ],
              allowedPaths: [
                "src/example.ts",
                "docs/roadmap/README.md",
              ],
            });
          }
          return claudeSuccess({
            objective:
              "Implement authenticated favorite persistence and idempotent guest merge.",
            deliverables: [
              "Implement server persistence and idempotent merge in src/example.ts.",
              "Update docs/roadmap/README.md.",
            ],
            outOfScope: ["No deployment."],
            allowedPaths: [
              "src/example.ts",
              "docs/roadmap/README.md",
            ],
          });
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(
      result.ok ? result.model : null,
      AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
    );
    assert.equal(observedCalls.length, 2);

    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.decision.decision.brief?.deliverables, [
        "Implement server persistence and idempotent merge in src/example.ts.",
        "Update docs/roadmap/README.md.",
      ]);
      assert.deepEqual(parsed.decision.decision.brief?.outOfScope, [
        "No deployment.",
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects provider-phase validation deliverables and retries once with Sonnet", async () => {
  const { root, project, head } = fixture();
  try {
    const observedCalls: string[][] = [];
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async (args) => {
          observedCalls.push([...args]);
          if (observedCalls.length === 1) {
            return claudeSuccess({
              objective: "Implement the bounded continuation result.",
              deliverables: [
                "Add docs/continuation-proof.md.",
                "Verification: pnpm run ci must pass.",
                "Mark H1-L1 complete after CI passes.",
              ],
              outOfScope: ["No deployment."],
              allowedPaths: [
                "docs/continuation-proof.md",
                "docs/roadmap/README.md",
              ],
            });
          }
          return claudeSuccess();
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(result.ok ? result.status : null, "renewed");
    assert.equal(
      result.ok ? result.model : null,
      AUTO_SUBSCRIPTION_DECISION_ESCALATION_MODEL,
    );
    assert.equal(observedCalls.length, 2);

    const secondSystemPromptIndex =
      observedCalls[1]?.indexOf("--system-prompt") ?? -1;
    assert.ok(secondSystemPromptIndex >= 0);
    assert.match(
      observedCalls[1]?.[secondSystemPromptIndex + 1] ?? "",
      /never require the provider to run validation, make CI pass, wait for validation/i,
    );

    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      const deliverables =
        parsed.decision.decision.brief?.deliverables ?? [];
      assert.equal(
        deliverables.some((item) => /pnpm run ci|after CI passes/i.test(item)),
        false,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebinds a stale SHA locally when the canonical contract is unchanged", async () => {
  const { root, project, head } = fixture();
  try {
    mkdirSync(join(root, ".loop-engine"), { recursive: true });
    writeFileSync(
      join(root, ".loop-engine", "execution-decision.yaml"),
      readyDecision("b".repeat(40)),
      "utf8",
    );
    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );
    assert.deepEqual(result, { ok: true, status: "renewed" });
    assert.equal(calls, 0);

    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.decision.source.gitHead, head);
      assert.deepEqual(parsed.decision.decision.candidate?.allowedPaths, [
        "docs/continuation-proof.md",
        "docs/roadmap/README.md",
      ]);
      assert.deepEqual(parsed.decision.decision.brief?.deliverables, [
        "Add docs/continuation-proof.md.",
        "Mark H1-L1 complete.",
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rebinds a stale decision locally when the canonical scope only expands", async () => {
  const { root, project, head } = fixture();
  try {
    mkdirSync(join(root, ".loop-engine"), { recursive: true });
    writeFileSync(
      join(root, ".loop-engine", "execution-decision.yaml"),
      [
        "version: 1",
        "project: example",
        "decision:",
        "  state: READY",
        "  candidate:",
        "    id: H1-L1",
        "    allowedPaths:",
        "      - docs/roadmap/README.md",
        "  brief:",
        "    objective: Document the bounded continuation result.",
        "    deliverables:",
        "      - Add docs/continuation-proof.md.",
        "      - Mark H1-L1 complete.",
        "    outOfScope:",
        "      - No deployment.",
        "source:",
        "  document: docs/roadmap/README.md",
        `  gitHead: ${"b".repeat(40)}`,
        "",
      ].join("\n"),
      "utf8",
    );

    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );

    assert.deepEqual(result, { ok: true, status: "renewed" });
    assert.equal(calls, 0);

    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.decision.source.gitHead, head);
      assert.deepEqual(parsed.decision.decision.candidate?.allowedPaths, [
        "docs/continuation-proof.md",
        "docs/roadmap/README.md",
      ]);
      assert.deepEqual(parsed.decision.decision.brief?.deliverables, [
        "Add docs/continuation-proof.md.",
        "Mark H1-L1 complete.",
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("falls back to provider renewal when a stale decision scope no longer matches the canonical scope", async () => {
  const { root, project, head } = fixture();
  try {
    mkdirSync(join(root, ".loop-engine"), { recursive: true });
    writeFileSync(
      join(root, ".loop-engine", "execution-decision.yaml"),
      [
        "version: 1",
        "project: example",
        "decision:",
        "  state: READY",
        "  candidate:",
        "    id: H1-L1",
        "    allowedPaths:",
        "      - docs/legacy-proof.md",
        "  brief:",
        "    objective: Document the bounded continuation result.",
        "    deliverables:",
        "      - Add docs/legacy-proof.md.",
        "    outOfScope:",
        "      - No deployment.",
        "source:",
        "  document: docs/roadmap/README.md",
        `  gitHead: ${"b".repeat(40)}`,
        "",
      ].join("\n"),
      "utf8",
    );

    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );

    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    assert.equal(
      result.ok ? result.model : null,
      AUTO_SUBSCRIPTION_DECISION_MODEL,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not override an explicit BLOCKED execution decision", async () => {
  const { root, project, head } = fixture();
  try {
    mkdirSync(join(root, ".loop-engine"), { recursive: true });
    writeFileSync(
      join(root, ".loop-engine", "execution-decision.yaml"),
      [
        "version: 1",
        "project: example",
        "decision:",
        "  state: BLOCKED",
        "  reason: External gate is not satisfied.",
        "source:",
        `  gitHead: ${head}`,
        "",
      ].join("\n"),
      "utf8",
    );
    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_authorization_blocked");
    }
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses autonomous renewal when the canonical lot has no detailed brief", async () => {
  const { root, project, head } = fixture({ detail: false });
  try {
    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_requires_detailed_brief");
    }
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses autonomous renewal when the canonical lot has no deterministic writable scope", async () => {
  const { root, project, head } = fixture({ writeScope: false });
  try {
    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_requires_detailed_scope");
    }
    assert.equal(calls, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses a symlinked local decision directory before calling Claude", async () => {
  const { root, project, head } = fixture();
  const outside = mkdtempSync(join(tmpdir(), "loop-auto-decision-outside-"));
  try {
    symlinkSync(outside, join(root, ".loop-engine"), "dir");
    let calls = 0;
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () => {
          calls += 1;
          return claudeSuccess();
        },
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_decision_write_failed");
    }
    assert.equal(calls, 0);
    assert.equal(existsSync(join(outside, "execution-decision.yaml")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("ignores provider writable scope and enforces the documented canonical scope", async () => {
  const { root, project, head } = fixture();
  try {
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () =>
          claudeSuccess({
            objective: "Document the bounded continuation result.",
            deliverables: [
              "Add docs/continuation-proof.md.",
              "Mark H1-L1 complete.",
            ],
            outOfScope: ["No deployment."],
            allowedPaths: [".loop-engine/**", "docs/**"],
          }),
      },
    );
    assert.equal(result.ok, true);
    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(parsed.decision.decision.candidate?.allowedPaths, [
        "docs/continuation-proof.md",
        "docs/roadmap/README.md",
      ]);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
