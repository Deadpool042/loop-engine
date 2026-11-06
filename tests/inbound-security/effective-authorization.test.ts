import assert from "node:assert/strict";
import test from "node:test";

import type { ConfiguredInboundAclRule } from "../../src/inbound-security/configured-acl.js";
import { evaluateEffectiveInboundAuthorization } from "../../src/inbound-security/effective-authorization.js";
import {
  createConfiguredInboundPrincipalDirectory,
  type InboundPrincipalDirectory,
} from "../../src/inbound-security/principal-directory.js";

const directory = createConfiguredInboundPrincipalDirectory([
  {
    principalId: "p-alice",
    principalType: "user",
    tenantId: "tenant-a",
    roles: ["operator"],
  },
  {
    principalId: "p-ghost",
    principalType: "user",
    tenantId: "tenant-a",
    roles: ["nobody"],
  },
]);

const aclRule = (overrides: Record<string, unknown> = {}) =>
  ({
    ruleId: "acl-1",
    tenantId: "tenant-a",
    requiredRoles: ["operator"],
    projects: ["creatyss"],
    operations: ["read", "execute"],
    ...overrides,
  }) as unknown as ConfiguredInboundAclRule;

const ceilingRule = (overrides: Record<string, unknown> = {}) => ({
  keyId: "svc-key-1",
  projects: ["creatyss"],
  operations: ["read", "execute"],
  ...overrides,
});

const evaluate = (
  overrides: Partial<{
    directory: InboundPrincipalDirectory;
    principalId: string;
    keyId: string;
    project: string;
    operation: "dry-run" | "execute" | "read" | "cancel";
    aclRules: readonly ConfiguredInboundAclRule[];
    ceilingRules: unknown;
  }> = {},
) =>
  evaluateEffectiveInboundAuthorization({
    directory,
    principalId: "p-alice",
    keyId: "svc-key-1",
    project: "creatyss",
    operation: "read",
    aclRules: [aclRule()],
    ceilingRules: [ceilingRule()],
    ...overrides,
  });

test("allowed only when both the principal ACL and the service ceiling allow", () => {
  assert.deepEqual(evaluate(), {
    allowed: true,
    principalId: "p-alice",
    keyId: "svc-key-1",
    ruleId: "acl-1",
  });
});

test("the ceiling restricts the principal: ACL allows, ceiling does not", () => {
  const cases: Array<[string, Parameters<typeof evaluate>[0], string]> = [
    ["empty ceiling (default)", { ceilingRules: [] }, "service_unknown"],
    ["unknown service", { keyId: "svc-other" }, "service_unknown"],
    [
      "project outside ceiling",
      { ceilingRules: [ceilingRule({ projects: ["lp-infra"] })] },
      "service_project_not_authorized",
    ],
    [
      "operation outside ceiling",
      {
        ceilingRules: [ceilingRule({ operations: ["read"] })],
        operation: "execute",
      },
      "service_operation_not_authorized",
    ],
    [
      "invalid ceiling",
      { ceilingRules: [ceilingRule(), ceilingRule()] },
      "ceiling_configuration_invalid",
    ],
  ];
  for (const [label, overrides, reason] of cases) {
    assert.deepEqual(
      evaluate(overrides),
      {
        allowed: false,
        source: "service_ceiling",
        reason,
      },
      label,
    );
  }
});

test("the principal rights restrict the service: ceiling allows, ACL does not", () => {
  const cases: Array<[string, Parameters<typeof evaluate>[0], string]> = [
    ["role missing", { principalId: "p-ghost" }, "role_not_authorized"],
    [
      "project not granted",
      { aclRules: [aclRule({ projects: ["lp-infra"] })] },
      "project_not_authorized",
    ],
    [
      "operation not granted",
      { aclRules: [aclRule({ operations: ["read"] })], operation: "execute" },
      "operation_not_authorized",
    ],
    [
      "tenant mismatch",
      { aclRules: [aclRule({ tenantId: "tenant-b" })] },
      "tenant_not_authorized",
    ],
    ["invalid ACL", { aclRules: [] }, "acl_configuration_invalid"],
  ];
  for (const [label, overrides, reason] of cases) {
    assert.deepEqual(
      evaluate(overrides),
      {
        allowed: false,
        source: "principal_acl",
        reason,
      },
      label,
    );
  }
});

test("the effective right is the intersection in both directions", () => {
  // ACL {read, execute} ∩ ceiling {read} = {read}
  const narrowCeiling = {
    ceilingRules: [ceilingRule({ operations: ["read"] })],
  };
  assert.equal(evaluate({ ...narrowCeiling, operation: "read" }).allowed, true);
  assert.equal(
    evaluate({ ...narrowCeiling, operation: "execute" }).allowed,
    false,
  );
  // ACL {read} ∩ ceiling {read, execute, cancel} = {read}
  const narrowAcl = {
    aclRules: [aclRule({ operations: ["read"] })],
    ceilingRules: [ceilingRule({ operations: ["read", "execute", "cancel"] })],
  };
  assert.equal(evaluate({ ...narrowAcl, operation: "read" }).allowed, true);
  assert.equal(evaluate({ ...narrowAcl, operation: "execute" }).allowed, false);
  assert.equal(evaluate({ ...narrowAcl, operation: "cancel" }).allowed, false);
});

test("an unknown principal is denied before any right is considered", () => {
  assert.deepEqual(evaluate({ principalId: "p-nobody" }), {
    allowed: false,
    source: "principal_directory",
    reason: "principal_unknown",
  });
  for (const principalId of ["", " p-alice", "P-ALICE", "p-alice\n"]) {
    assert.equal(
      evaluate({ principalId }).allowed,
      false,
      JSON.stringify(principalId),
    );
  }
});

test("a directory port that misbehaves fails closed", () => {
  const wrongIdentity: InboundPrincipalDirectory = {
    resolve: () => ({
      principalId: "p-ghost",
      principalType: "user",
      tenantId: "tenant-a",
      roles: ["operator"],
    }),
  };
  const throwing: InboundPrincipalDirectory = {
    resolve: () => {
      throw new Error("boom");
    },
  };
  const undef = {
    resolve: () => undefined,
  } as unknown as InboundPrincipalDirectory;
  for (const port of [wrongIdentity, throwing, undef]) {
    assert.deepEqual(evaluate({ directory: port }), {
      allowed: false,
      source: "principal_directory",
      reason: "principal_unknown",
    });
  }
});

test("roles and tenant come only from the directory, never from the request", () => {
  // The function has no parameter for a caller-supplied role or tenant: even a
  // principal id that looks like a role grant resolves to nothing.
  assert.equal(evaluate({ principalId: "p-alice:admin" }).allowed, false);
  // p-ghost is authenticated by identifier alone but only has the role "nobody".
  assert.equal(evaluate({ principalId: "p-ghost" }).allowed, false);
});

test("nothing is allowed by default", () => {
  assert.equal(evaluate({ aclRules: [], ceilingRules: [] }).allowed, false);
  assert.equal(evaluate({ ceilingRules: undefined }).allowed, false);
  assert.equal(evaluate({ ceilingRules: "svc-key-1" }).allowed, false);
});
