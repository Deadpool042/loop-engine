import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CORE_CONCRETE_DEPENDENCY_DIRECTION_RULE,
  extractModuleSpecifiers,
  inspectCoreConcreteDependencyDirection,
} from "../../src/audit/rules/core-concrete-dependency-direction.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const FACADE_PATH = "src/core/configured-inbound-security-adapter.ts";

test("extractModuleSpecifiers detects imports, exports and dynamic imports", () => {
  assert.deepEqual(
    extractModuleSpecifiers(`
      import type { Port } from "../runtime/port.js";
      export { execute } from "../inbound-adapters/configured-inbound-adapter.js";
      const module = import("../inbound-security/configured-api-key.js");
    `),
    [
      "../runtime/port.js",
      "../inbound-adapters/configured-inbound-adapter.js",
      "../inbound-security/configured-api-key.js",
    ],
  );
});

test("allows contract dependencies and the reviewed concrete facade", () => {
  const violations = inspectCoreConcreteDependencyDirection([
    {
      path: "src/core/runtime-service.ts",
      source: 'import type { RuntimePort } from "../runtime/types.js";',
    },
    {
      path: FACADE_PATH,
      source: `
        export { executeConfiguredInboundAdapterRequest } from "../inbound-adapters/configured-inbound-adapter.js";
        export { createConfiguredApiKeyVerifier } from "../inbound-security/configured-api-key.js";
        export { evaluateConfiguredInboundAcl } from "../inbound-security/configured-acl.js";
        export { createFileInboundReplayProtectionPort } from "../inbound-security/file-replay-protection.js";
      `,
    },
  ]);

  assert.deepEqual(violations, []);
});

test("rejects a concrete adapter import outside the facade", () => {
  const violations = inspectCoreConcreteDependencyDirection([
    {
      path: "src/core/runtime-service.ts",
      source:
        'import { executeConfiguredInboundAdapterRequest } from "../inbound-adapters/configured-inbound-adapter.js";',
    },
  ]);

  assert.deepEqual(violations, [
    {
      path: "src/core/runtime-service.ts",
      target: "../inbound-adapters/configured-inbound-adapter.js",
      reason: "concrete_dependency_outside_facade",
    },
  ]);
});

test("rejects configured security and file-backed implementations outside the facade", () => {
  const violations = inspectCoreConcreteDependencyDirection([
    {
      path: "src/core/security.ts",
      source: `
        export { evaluateConfiguredInboundAcl } from "../inbound-security/configured-acl.js";
        const replay = import("../inbound-security/file-replay-protection.js");
      `,
    },
  ]);

  assert.deepEqual(
    violations.map(({ reason, target }) => ({ reason, target })),
    [
      {
        target: "../inbound-security/configured-acl.js",
        reason: "concrete_dependency_outside_facade",
      },
      {
        target: "../inbound-security/file-replay-protection.js",
        reason: "concrete_dependency_outside_facade",
      },
    ],
  );
});

test("rejects expansion of the concrete facade without explicit approval", () => {
  const violations = inspectCoreConcreteDependencyDirection([
    {
      path: FACADE_PATH,
      source:
        'export { createOtherAdapter } from "../inbound-adapters/other-adapter.js";',
    },
  ]);

  assert.deepEqual(violations, [
    {
      path: FACADE_PATH,
      target: "../inbound-adapters/other-adapter.js",
      reason: "unapproved_facade_target",
    },
  ]);
});

test("AUDIT-498 is registered and passes on the repository", () => {
  const registered = AUDIT_RULES.find((rule) => rule.id === "AUDIT-498");

  assert.ok(registered);
  assert.equal(registered.title, CORE_CONCRETE_DEPENDENCY_DIRECTION_RULE.title);
  assert.equal(registered.check().status, "pass");
});
