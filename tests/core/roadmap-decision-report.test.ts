import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { type ProjectConfig } from "../../src/core/config.js";
import { generateRoadmapDecisionReport } from "../../src/core/reports.js";
import type { TextOnlyProvider } from "../../src/text-only-provider/index.js";

function setupProject(files: Readonly<Record<string, string>>): {
  path: string;
  cleanup: () => void;
} {
  const path = join(
    tmpdir(),
    `loop-decision-report-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(path, { recursive: true });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(path, relativePath);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
  return {
    path,
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

function project(
  path: string,
  overrides: Partial<ProjectConfig> = {},
): ProjectConfig {
  return {
    name: "example",
    path,
    type: "fixture",
    required_docs: [],
    validation: [],
    requires_git: false,
    planning: { mode: "roadmap", objective_source: "objective.md" },
    roadmap: ["roadmap.md"],
    ...overrides,
  };
}

/** A provider that fails the test if it is ever invoked. */
function poisonedProvider(): TextOnlyProvider {
  return {
    async invoke() {
      throw new Error("provider must never be called on this path");
    },
  };
}

function proposedProvider(): TextOnlyProvider {
  return {
    async invoke() {
      return {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-sonnet-5",
        output: JSON.stringify({
          assessment: { observedGaps: ["gap"], assumptions: [] },
          proposal: {
            status: "proposed",
            summary: "Small bounded lot.",
            lots: [
              {
                title: "Lot",
                objective: "Objective.",
                benefit: "Benefit.",
                cost: "low",
                risk: "low",
                dependencies: [],
              },
            ],
          },
        }),
        durationMs: 5,
        truncated: false,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
}

function noProposalProvider(): TextOnlyProvider {
  return {
    async invoke() {
      return {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-haiku-4-5",
        output: JSON.stringify({
          assessment: { observedGaps: [], assumptions: [] },
          proposal: { status: "no_proposal", reason: "No observable gap." },
        }),
        durationMs: 5,
        truncated: false,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
}

function invalidResponseProvider(): TextOnlyProvider {
  return {
    async invoke() {
      return {
        status: "completed",
        provider: "anthropic_api",
        model: "claude-haiku-4-5",
        output: "not json",
        durationMs: 5,
        truncated: false,
        usage: { inputTokens: 100, outputTokens: 50 },
      };
    },
  };
}

function failedProvider(): TextOnlyProvider {
  return {
    async invoke(input) {
      return {
        status: "failed",
        provider: "openclaw_agent",
        model: input.model,
        code: "provider_unavailable",
        message: "redacted provider failure",
        durationMs: 7,
        truncated: false,
      };
    },
  };
}

test("1. an existing admissible candidate wins: existing_candidate, provider never called", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [ ] Ship the safe lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path),
      {
        requestProposal: {
          provider: poisonedProvider(),
          providerAvailable: true,
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "existing_candidate");
    assert.ok(report.candidate);
  } finally {
    fixture.cleanup();
  }
});

test("2. a warning-kind admissible candidate is selected the same way (Roadmap Reader selection unchanged)", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [ ] Préparer le déploiement",
  });
  try {
    const report = await generateRoadmapDecisionReport(project(fixture.path));
    assert.equal(report.decision, "existing_candidate");
    assert.equal(report.candidate?.kind, "warning");
  } finally {
    fixture.cleanup();
  }
});

test("3. a closed phase-gate blocking the only candidate projects gated_no_work and never invents work", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": [
      "<!-- loop-engine:phase-gate phase=H1 state=closed blockedBy=external-gate -->",
      "| H1-L1 | Blocked lot | ⬜ À faire |",
    ].join("\n"),
  });
  try {
    const report = await generateRoadmapDecisionReport(project(fixture.path));
    assert.equal(report.decision, "unavailable");
    assert.equal(report.reason, "gated_no_work");
  } finally {
    fixture.cleanup();
  }
});

test("4. no admissible candidate + objective available + explicit request + real gap => proposal", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path),
      {
        requestProposal: {
          provider: proposedProvider(),
          providerAvailable: true,
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "proposal");
    assert.equal(report.proposal?.status, "proposed");
    assert.equal(report.providerCall?.requested, true);
  } finally {
    fixture.cleanup();
  }
});

test("5. no admissible candidate + objective available + explicit request + no gap => no_proposal", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path),
      {
        requestProposal: {
          provider: noProposalProvider(),
          providerAvailable: true,
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "no_proposal");
    assert.equal(report.reason, "No observable gap.");
  } finally {
    fixture.cleanup();
  }
});

test("6. objective unavailable => unavailable, deterministic, no provider call even if one is passed", async () => {
  const fixture = setupProject({
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path, {
        planning: { mode: "roadmap" },
      }),
      {
        requestProposal: {
          provider: poisonedProvider(),
          providerAvailable: true,
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "unavailable");
    assert.equal(report.reason, "objective_required");
  } finally {
    fixture.cleanup();
  }
});

test("7. an oversized objective source fails closed as unavailable, not as a fabricated proposal", async () => {
  const fixture = setupProject({
    "objective.md": "x".repeat(70 * 1024),
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path),
      {
        requestProposal: {
          provider: poisonedProvider(),
          providerAvailable: true,
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "unavailable");
    assert.equal(report.reason, "objective_required");
  } finally {
    fixture.cleanup();
  }
});

test("8. provider unavailable (no credential) => unavailable, no network call attempted", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path),
      {
        requestProposal: {
          provider: poisonedProvider(),
          providerAvailable: false,
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "unavailable");
    assert.equal(report.reason, "credential_unavailable");
  } finally {
    fixture.cleanup();
  }
});

test("9. an invalid provider response fails closed as unavailable and materializes no lot", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path),
      {
        requestProposal: {
          provider: invalidResponseProvider(),
          providerAvailable: true,
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "unavailable");
    assert.equal(report.reason, "invalid_proposal_response");
    assert.equal("proposal" in report, false);
  } finally {
    fixture.cleanup();
  }
});

test("10. a provider failure exposes only its bounded failure code", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(
      project(fixture.path),
      {
        requestProposal: {
          provider: failedProvider(),
          providerAvailable: true,
          model: "openai/gpt-5.6-sol",
          timeoutMs: 60_000,
        },
      },
    );
    assert.equal(report.decision, "unavailable");
    assert.equal(report.reason, "provider_error");
    assert.equal(report.providerCall?.failureCode, "provider_unavailable");
    assert.equal(JSON.stringify(report).includes("redacted provider failure"), false);
  } finally {
    fixture.cleanup();
  }
});

test("11. a complete roadmap projects renewal availability without triggering a proposal", async () => {
  const fixture = setupProject({
    "objective.md": "Objective.",
    "roadmap.md": "- [x] Done lot",
  });
  try {
    const report = await generateRoadmapDecisionReport(project(fixture.path));
    assert.equal(report.decision, "unavailable");
    assert.equal(report.reason, "roadmap_exhausted_objective_available");
  } finally {
    fixture.cleanup();
  }
});
