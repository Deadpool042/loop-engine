import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type { ProjectConfig } from "../../src/core/config.js";
import {
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

function fixture(options: { detail?: boolean } = {}): {
  root: string;
  project: ProjectConfig;
  head: string;
} {
  const root = mkdtempSync(join(tmpdir(), "loop-auto-decision-"));
  mkdirSync(join(root, "docs", "roadmap"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".loop-engine/\n", "utf8");
  writeFileSync(join(root, "OBJECTIVE.md"), "# Objective\n\nKeep the workflow governed.\n", "utf8");
  writeFileSync(
    join(root, "docs", "roadmap", "README.md"),
    options.detail === false
      ? "# Roadmap\n\n- [ ] H1-L1 — Finish bounded continuation.\n"
      : "# Roadmap\n\n- [ ] H1-L1 — Finish bounded continuation. [Détail](./h1-l1.md)\n",
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

test("renews a stale SHA-bound decision for the exact current candidate", async () => {
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
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    const parsed = parseExecutionDecisionFile(
      readFileSync(
        join(root, ".loop-engine", "execution-decision.yaml"),
        "utf8",
      ),
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.decision.source.gitHead, head);
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

test("mechanically rejects a proposal that tries to write Loop Engine internal state", async () => {
  const { root, project, head } = fixture();
  try {
    const result = await ensureAutoSubscriptionExecutionDecision(
      project,
      head,
      "H1-L1",
      {
        runClaude: async () =>
          claudeSuccess({
            objective: "Bad scope.",
            deliverables: ["Write internal state."],
            outOfScope: ["Nothing."],
            allowedPaths: [".loop-engine/**", "docs/roadmap/README.md"],
          }),
      },
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "auto_subscription_decision_invalid_scope");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
