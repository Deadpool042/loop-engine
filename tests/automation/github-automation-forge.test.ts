import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createGitHubAutomationForge,
  type GitHubAutomationForgeConfiguration,
} from "../../src/automation/adapters/github/index.js";
import type { AutomationForgeRequest } from "../../src/automation/forge/index.js";

const metadata = Object.freeze({
  schemaVersion: 1 as const,
  correlationId: "correlation-1",
  createdAt: "2026-07-31T00:00:00.000Z",
  labels: Object.freeze(["automation"]),
  attributes: Object.freeze({ source: "test" }),
});

const request = (capability: "review" | "release"): AutomationForgeRequest =>
  Object.freeze({
    requestId: "forge-" + capability,
    automationRequest: Object.freeze({
      requestId: "automation-" + capability,
      capability,
      context: Object.freeze({
        scopeId: "scope-1",
        subjectId: "subject-1",
        metadata,
      }),
      metadata,
    }),
    context: Object.freeze({
      scopeId: "scope-1",
      subjectId: "subject-1",
      metadata,
    }),
    metadata: Object.freeze({
      schemaVersion: 1,
      forgeId: "github",
      labels: Object.freeze(["automation"]),
      attributes: Object.freeze({ source: "test" }),
    }),
  });

const configuration = (): GitHubAutomationForgeConfiguration =>
  Object.freeze({
    capabilities: Object.freeze(["review"] as const),
    metadata: Object.freeze({
      schemaVersion: 1,
      organization: "loop-engine",
      repository: "loop-engine",
      labels: Object.freeze(["github"]),
      attributes: Object.freeze({ installation: "test" }),
    }),
  });

test("GitHubAutomationForge implements AutomationForge with copied immutable configuration", () => {
  const forge = createGitHubAutomationForge(configuration(), {
    dispatch: () => Object.freeze({ status: "accepted" as const }),
  });

  assert.equal(forge.id, "github");
  assert.equal(Object.isFrozen(forge), true);
  assert.equal(Object.isFrozen(forge.configuration), true);
  assert.equal(Object.isFrozen(forge.configuration.capabilities), true);
  assert.deepEqual(forge.capabilities, ["review"]);
  assert.deepEqual(forge.metadata.attributes, {
    installation: "test",
    organization: "loop-engine",
    repository: "loop-engine",
  });
});

test("GitHubAutomationForge translates a review request through its internal transport", () => {
  const observed: unknown[] = [];
  const forge = createGitHubAutomationForge(configuration(), {
    dispatch: (transportRequest) => {
      observed.push(transportRequest);
      return Object.freeze({ status: "completed" as const });
    },
  });

  const reviewRequest = request("review");
  const result = forge.handle(reviewRequest);

  assert.deepEqual(result, {
    status: "completed",
    forgeId: "github",
    error: null,
    metadata: reviewRequest.metadata,
  });
  assert.deepEqual(observed, [
    {
      operation: "pull_request_review",
      requestId: "forge-review",
      organization: "loop-engine",
      repository: "loop-engine",
      context: reviewRequest.context,
      metadata: reviewRequest.automationRequest.metadata,
    },
  ]);
});

test("GitHubAutomationForge rejects unsupported capabilities without dispatching", () => {
  const forge = createGitHubAutomationForge(configuration(), {
    dispatch: () => {
      throw new Error("transport should not be called");
    },
  });

  const result = forge.handle(request("release"));

  assert.equal(result.status, "rejected");
  assert.equal(result.error?.code, "unsupported_capability");
  assert.equal(
    result.error?.message,
    "GitHub forge does not support the requested capability.",
  );
});

test("GitHubAutomationForge converts transport failure into a stable forge result", () => {
  const forge = createGitHubAutomationForge(configuration(), {
    dispatch: () => {
      throw new Error("unavailable");
    },
  });

  const result = forge.handle(request("review"));

  assert.equal(result.status, "rejected");
  assert.equal(result.error?.code, "forge_unavailable");
  assert.equal(result.error?.message, "GitHub forge transport is unavailable.");
});

test("GitHubAutomationForge stays isolated from network clients and the Automation public barrel", () => {
  const source = readFileSync(
    "src/automation/adapters/github/github-automation-forge.ts",
    "utf8",
  );
  const automationPublicBarrel = readFileSync(
    "src/automation/index.ts",
    "utf8",
  );

  assert.doesNotMatch(
    source,
    /\bfetch\b|\boctokit\b|\baxios\b|\bhttps?\b|\bnode:fs\b|\bprocess\b|\bexec\b|\bspawn\b/i,
  );
  assert.match(source, /from "\.\.\/\.\.\/types\.js"/);
  assert.match(source, /from "\.\.\/\.\.\/forge\/index\.js"/);
  assert.doesNotMatch(automationPublicBarrel, /adapters\/github/);
});
