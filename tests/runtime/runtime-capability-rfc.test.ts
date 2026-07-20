import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  createRuntimeCapability,
  createRuntimeCapabilityRequirement,
  evaluateRuntimeCapability,
  evaluateRuntimeCapabilityCompatibility,
  summarizeRuntimeCapability,
  summarizeRuntimeCapabilityCompatibility,
  validateRuntimeCapability,
  validateRuntimeCapabilityRequirement,
} from "../../src/core/runtime-capability.js";

const capabilityInput = {
  id: "runtime.code",
  category: "execution",
  version: "v1",
  supportedFeatures: ["test", "edit"],
  declaredConstraints: ["local-only"],
  compatibilityReferences: ["runtime-v1"],
};

const requirementInput = {
  id: "runtime.code",
  category: "execution",
  version: "v1",
  requiredFeatures: ["edit"],
  acceptedConstraints: ["local-only"],
};

test("creates valid immutable Runtime Capability declarations without mutating input", () => {
  const before = structuredClone(capabilityInput);
  const capability = createRuntimeCapability(capabilityInput);
  const result = evaluateRuntimeCapability(capabilityInput);

  assert.deepEqual(capabilityInput, before);
  assert.deepEqual(capability.supportedFeatures, ["edit", "test"]);
  assert.equal(result.valid, true);
  assert.equal(result.metadataOnly, true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.capability.supportedFeatures), true);
  assert.equal(JSON.parse(JSON.stringify(result)).metadataOnly, true);
  assert.deepEqual(summarizeRuntimeCapability(result), {
    id: "runtime.code",
    version: "v1",
    valid: true,
    metadataOnly: true,
  });
});

test("rejects invalid Runtime Capability declarations and requirements", () => {
  assert.equal(evaluateRuntimeCapability(null).valid, false);
  assert.equal(
    evaluateRuntimeCapability({ ...capabilityInput, version: "" })
      .diagnostics[0]?.code,
    "runtime_capability_invalid",
  );
  assert.equal(
    validateRuntimeCapability({
      ...capabilityInput,
      supportedFeatures: null as unknown as string[],
    })[0]?.code,
    "runtime_capability_metadata_invalid",
  );
  assert.equal(
    validateRuntimeCapabilityRequirement(null)[0]?.code,
    "runtime_capability_requirement_missing",
  );
  assert.equal(
    validateRuntimeCapabilityRequirement({
      ...requirementInput,
      requiredFeatures: null as unknown as string[],
    })[0]?.code,
    "runtime_capability_requirement_metadata_invalid",
  );
});

test("keeps capability declarations distinct from capability requirements", () => {
  const capability = createRuntimeCapability(capabilityInput);
  const requirement = createRuntimeCapabilityRequirement(requirementInput);

  assert.deepEqual(requirement.requiredFeatures, ["edit"]);
  assert.ok("supportedFeatures" in capability);
  assert.ok(!("requiredFeatures" in capability));
  assert.ok("requiredFeatures" in requirement);
  assert.ok(!("supportedFeatures" in requirement));
});

test("evaluates full compatibility deterministically", () => {
  const first = evaluateRuntimeCapabilityCompatibility(
    requirementInput,
    capabilityInput,
  );
  const second = evaluateRuntimeCapabilityCompatibility(
    { ...requirementInput, acceptedConstraints: ["local-only"] },
    { ...capabilityInput, supportedFeatures: ["edit", "test"] },
  );

  assert.equal(first.compatible, true);
  assert.deepEqual(first, second);
  assert.deepEqual(first.missingFeatures, []);
  assert.deepEqual(first.unacceptedConstraints, []);
});

test("rejects a missing mandatory feature with stable diagnostics", () => {
  const result = evaluateRuntimeCapabilityCompatibility(
    { ...requirementInput, requiredFeatures: ["shell", "edit"] },
    capabilityInput,
  );

  assert.equal(result.compatible, false);
  assert.deepEqual(result.missingFeatures, ["shell"]);
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["runtime_capability_features_missing"],
  );
});

test("allows extra offered features but rejects unaccepted constraints", () => {
  assert.equal(
    evaluateRuntimeCapabilityCompatibility(requirementInput, {
      ...capabilityInput,
      supportedFeatures: ["vision", "edit", "test"],
    }).compatible,
    true,
  );

  const constrained = evaluateRuntimeCapabilityCompatibility(requirementInput, {
    ...capabilityInput,
    declaredConstraints: ["sandboxed", "local-only"],
  });
  assert.equal(constrained.compatible, false);
  assert.deepEqual(constrained.unacceptedConstraints, ["sandboxed"]);
});

test("produces stable compatibility summaries", () => {
  const summary = summarizeRuntimeCapabilityCompatibility(
    evaluateRuntimeCapabilityCompatibility(
      {
        ...requirementInput,
        requiredFeatures: ["write", "read"],
        acceptedConstraints: [],
      },
      {
        ...capabilityInput,
        supportedFeatures: [],
        declaredConstraints: ["z", "a"],
      },
    ),
  );

  assert.deepEqual(summary, {
    requirementId: "runtime.code",
    capabilityId: "runtime.code",
    compatible: false,
    missingFeatures: ["read", "write"],
    unacceptedConstraints: ["a", "z"],
    diagnosticCodes: [
      "runtime_capability_constraints_unaccepted",
      "runtime_capability_features_missing",
    ],
    metadataOnly: true,
  });
});

test("Runtime Capability RFC states reconciled metadata-only semantics", () => {
  const rfc = readFileSync(
    "docs/architecture/runtime-capability-rfc.md",
    "utf8",
  );
  assert.match(rfc, /metadata only/);
  assert.match(rfc, /Capability declaration/);
  assert.match(rfc, /Capability requirement/);
  assert.match(rfc, /AgentCapability/);
});
