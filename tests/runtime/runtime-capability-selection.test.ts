import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  selectRuntimeByCapabilities,
  summarizeRuntimeCapabilitySelection,
} from "../../src/core/runtime-resolution.js";

const request = {
  id: "runtime-request",
  version: "v1",
  createdAt: "2026-07-20T00:00:00.000Z",
  bridge: {
    id: "execution-bridge",
    version: "v1",
    ready: true,
    executionAllowed: false as const,
    executionStarted: false as const,
  },
  evidenceReferences: ["bridge:execution-bridge"],
  capabilityRequirements: [
    {
      id: "runtime.code",
      category: "execution",
      version: "v1",
      requiredFeatures: ["edit"],
      acceptedConstraints: ["local-only"],
    },
  ],
};

const capability = {
  id: "runtime.code",
  category: "execution",
  version: "v1",
  supportedFeatures: ["test", "edit"],
  declaredConstraints: ["local-only"],
  compatibilityReferences: [],
};

const registry = {
  id: "runtime-registry",
  version: "v1",
  descriptors: [
    {
      id: "runtime-b",
      version: "v1",
      displayName: "Runtime B",
      lifecycleState: "eligible",
      capabilityReferences: ["runtime.code", "runtime.extra"],
    },
    {
      id: "runtime-a",
      version: "v1",
      displayName: "Runtime A",
      lifecycleState: "eligible",
      capabilityReferences: ["runtime.code"],
    },
    {
      id: "runtime-inactive",
      version: "v1",
      displayName: "Inactive Runtime",
      lifecycleState: "inactive",
      capabilityReferences: ["runtime.code"],
    },
  ],
  compatibilityReferences: [],
};

test("selects compatible runtime metadata deterministically without execution", () => {
  const before = structuredClone({
    request,
    registry,
    capabilities: [capability],
  });
  const result = selectRuntimeByCapabilities(request, registry, [capability]);
  const reordered = selectRuntimeByCapabilities(
    request,
    { ...registry, descriptors: [...registry.descriptors].reverse() },
    [
      {
        ...capability,
        supportedFeatures: [...capability.supportedFeatures].reverse(),
      },
    ],
  );

  assert.deepEqual({ request, registry, capabilities: [capability] }, before);
  assert.equal(result.outcome, "selected");
  assert.equal(result.runtimeId, "runtime-a");
  assert.deepEqual(result.compatibleRuntimeIds, ["runtime-a", "runtime-b"]);
  assert.equal(result.executionAllowed, false);
  assert.equal(result.executionStarted, false);
  assert.deepEqual(reordered, result);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.equal(
    result.candidates.some((candidate) =>
      Object.values(candidate).some((value) => typeof value === "function"),
    ),
    false,
  );
});

test("rejects selection when a mandatory capability is absent", () => {
  const result = selectRuntimeByCapabilities(
    request,
    {
      ...registry,
      descriptors: registry.descriptors.map((descriptor) => ({
        ...descriptor,
        capabilityReferences: [],
      })),
    },
    [capability],
  );

  assert.equal(result.outcome, "unsupported");
  assert.equal(result.runtimeId, null);
  assert.deepEqual(result.compatibleRuntimeIds, []);
  assert.ok(
    result.candidates.every(
      (candidate) => candidate.requirements[0]?.compatible === false,
    ),
  );
});

test("allows capabilities beyond the explicit requirements", () => {
  const result = selectRuntimeByCapabilities(request, registry, [
    capability,
    {
      ...capability,
      id: "runtime.extra",
      supportedFeatures: ["vision"],
    },
  ]);

  assert.equal(result.outcome, "selected");
  assert.equal(result.runtimeId, "runtime-a");
});

test("requires explicit capability requirements before selection", () => {
  const result = selectRuntimeByCapabilities(
    { ...request, capabilityRequirements: [] },
    registry,
    [capability],
  );

  assert.equal(result.outcome, "unsupported");
  assert.match(result.diagnostics[0] ?? "", /at least one explicit/);
});

test("summarizes selection in stable order", () => {
  const result = selectRuntimeByCapabilities(request, registry, [capability]);

  assert.deepEqual(summarizeRuntimeCapabilitySelection(result), {
    outcome: "selected",
    runtimeId: "runtime-a",
    compatibleRuntimeIds: ["runtime-a", "runtime-b"],
    evaluatedRuntimeIds: ["runtime-a", "runtime-b"],
    diagnostics: [],
    executionAllowed: false,
    executionStarted: false,
  });
});

test("declarative selection has no provider or execution dependency", () => {
  const source = readFileSync("src/runtime/resolution/selection.ts", "utf8");

  assert.doesNotMatch(source, /from ["'][^"']*providers\//);
  assert.doesNotMatch(source, /from ["'][^"']*runtime\/types/);
  assert.doesNotMatch(source, /executeRuntime\s*\(/);
  assert.doesNotMatch(source, /node:/);
});
