import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateConfiguredInboundAcl,
  validateConfiguredInboundAclRules,
  type ConfiguredInboundAclRule,
} from "../../src/inbound-security/configured-acl.js";
import type { InboundPrincipal } from "../../src/inbound-security/types.js";

const principal = (
  overrides: Partial<InboundPrincipal> = {},
): InboundPrincipal =>
  Object.freeze({
    principalId: "principal-1",
    principalType: "user",
    tenantId: "tenant-a",
    roles: Object.freeze(["operator"]),
    ...overrides,
  });

const rule = (overrides: Record<string, unknown> = {}) => ({
  ruleId: "rule-1",
  tenantId: "tenant-a",
  requiredRoles: ["operator"],
  projects: ["creatyss"],
  operations: ["dry-run"],
  ...overrides,
});

const evaluate = (
  rules: unknown,
  overrides: Partial<{
    principal: InboundPrincipal | null;
    project: string;
    operation: string;
  }> = {},
) =>
  evaluateConfiguredInboundAcl({
    principal: principal(),
    project: "creatyss",
    operation: "dry-run",
    ...overrides,
    rules: rules as readonly ConfiguredInboundAclRule[],
  } as never);

// ---- Characterization of the existing behavior (dry-run / execute) ----

test("an exact tenant, role, project and operation match is allowed", () => {
  assert.deepEqual(evaluate([rule()]), { allowed: true, ruleId: "rule-1" });
});

test("denials follow the documented order: tenant, role, project, operation", () => {
  const rules = [rule()];
  assert.deepEqual(
    evaluate(rules, { principal: principal({ tenantId: "tenant-b" }) }),
    { allowed: false, reason: "tenant_not_authorized" },
  );
  assert.deepEqual(
    evaluate(rules, { principal: principal({ tenantId: null }) }),
    { allowed: false, reason: "tenant_not_authorized" },
  );
  assert.deepEqual(
    evaluate(rules, { principal: principal({ roles: ["reader"] }) }),
    { allowed: false, reason: "role_not_authorized" },
  );
  assert.deepEqual(evaluate(rules, { project: "lp-infra" }), {
    allowed: false,
    reason: "project_not_authorized",
  });
  assert.deepEqual(evaluate(rules, { operation: "execute" }), {
    allowed: false,
    reason: "operation_not_authorized",
  });
  // several failures at once: the tenant is reported first
  assert.deepEqual(
    evaluate(rules, {
      principal: principal({ tenantId: "x", roles: [] }),
      project: "nope",
      operation: "execute",
    }),
    { allowed: false, reason: "tenant_not_authorized" },
  );
});

test("every required role is needed and project comparison is exact", () => {
  const rules = [rule({ requiredRoles: ["operator", "release"] })];
  assert.equal(evaluate(rules).allowed, false);
  assert.equal(
    evaluate(rules, {
      principal: principal({ roles: ["operator", "release"] }),
    }).allowed,
    true,
  );
  for (const project of ["Creatyss", "creatyss ", "creatyss/", "*", ""]) {
    assert.deepEqual(evaluate([rule()], { project }), {
      allowed: false,
      reason: "project_not_authorized",
    });
  }
});

test("a missing principal or no rule is denied; an invalid configuration is denied", () => {
  assert.deepEqual(evaluate([rule()], { principal: null }), {
    allowed: false,
    reason: "principal_missing",
  });
  for (const invalid of [
    [],
    undefined,
    null,
    "rules",
    {},
    [null],
    [rule({ extra: 1 })],
  ]) {
    assert.deepEqual(evaluate(invalid), {
      allowed: false,
      reason: "acl_configuration_invalid",
    });
  }
});

test("the first matching rule grants; operations are granted per rule", () => {
  const rules = [
    rule({ ruleId: "dry", operations: ["dry-run"] }),
    rule({ ruleId: "exec", operations: ["execute"] }),
  ];
  assert.equal(
    evaluate(rules, { operation: "dry-run" }).allowed && "dry",
    "dry",
  );
  const exec = evaluate(rules, { operation: "execute" });
  assert.deepEqual(exec, { allowed: true, ruleId: "exec" });
});

test("configuration validation refuses malformed rules", () => {
  assert.equal(validateConfiguredInboundAclRules([rule()]), true);
  const bad: Array<[string, unknown]> = [
    ["empty list", []],
    ["duplicate ruleId", [rule(), rule()]],
    ["empty ruleId", [rule({ ruleId: " " })]],
    ["empty roles", [rule({ requiredRoles: [] })]],
    ["duplicate roles", [rule({ requiredRoles: ["a", "a"] })]],
    ["empty projects", [rule({ projects: [] })]],
    ["empty operations", [rule({ operations: [] })]],
    ["duplicate operations", [rule({ operations: ["execute", "execute"] })]],
    [
      "missing key",
      [
        (() => {
          const { operations: _o, ...rest } = rule();
          return rest;
        })(),
      ],
    ],
    ["extra key", [rule({ other: true })]],
    ["tenant not string/null", [rule({ tenantId: 3 })]],
    [
      "getter property",
      [
        Object.defineProperty(rule(), "ruleId", {
          enumerable: true,
          get: () => "x",
        }),
      ],
    ],
    [
      "non-plain object",
      [Object.assign(Object.create({ inherited: 1 }), rule())],
    ],
  ];
  for (const [label, rules] of bad) {
    assert.equal(validateConfiguredInboundAclRules(rules), false, label);
  }
});

test("the existing operations dry-run and execute remain valid and distinct", () => {
  assert.equal(
    validateConfiguredInboundAclRules([
      rule({ operations: ["dry-run", "execute"] }),
    ]),
    true,
  );
  const rules = [rule({ operations: ["dry-run"] })];
  assert.equal(evaluate(rules, { operation: "dry-run" }).allowed, true);
  assert.equal(evaluate(rules, { operation: "execute" }).allowed, false);
});

test("unknown operation names are refused by the validator", () => {
  for (const operation of [
    "run",
    "write",
    "READ",
    "Dry-Run",
    "execute ",
    "",
    "*",
    "all",
    1,
    null,
    undefined,
  ]) {
    assert.equal(
      validateConfiguredInboundAclRules([rule({ operations: [operation] })]),
      // `read` and `cancel` are covered in the E3 section below
      false,
      String(operation),
    );
  }
});

// ---- E3: additive `read` and `cancel` ----

test("read and cancel are accepted by the validator, alone or combined", () => {
  for (const operations of [
    ["read"],
    ["cancel"],
    ["read", "cancel"],
    ["dry-run", "execute", "read", "cancel"],
  ]) {
    assert.equal(
      validateConfiguredInboundAclRules([rule({ operations })]),
      true,
      operations.join(","),
    );
  }
});

test("a rule grants only the operations it lists", () => {
  const readOnly = [rule({ operations: ["read"] })];
  assert.deepEqual(evaluate(readOnly, { operation: "read" }), {
    allowed: true,
    ruleId: "rule-1",
  });
  for (const operation of ["dry-run", "execute", "cancel"]) {
    assert.deepEqual(evaluate(readOnly, { operation }), {
      allowed: false,
      reason: "operation_not_authorized",
    });
  }
  const cancelOnly = [rule({ operations: ["cancel"] })];
  assert.equal(evaluate(cancelOnly, { operation: "cancel" }).allowed, true);
  for (const operation of ["dry-run", "execute", "read"]) {
    assert.equal(evaluate(cancelOnly, { operation }).allowed, false, operation);
  }
});

test("existing rules gain no permission from the new vocabulary", () => {
  const legacy = [rule({ operations: ["dry-run", "execute"] })];
  for (const operation of ["read", "cancel"]) {
    assert.deepEqual(evaluate(legacy, { operation }), {
      allowed: false,
      reason: "operation_not_authorized",
    });
  }
});

test("read and cancel keep the tenant, role and project checks", () => {
  const rules = [rule({ operations: ["read", "cancel"] })];
  for (const operation of ["read", "cancel"]) {
    assert.equal(
      evaluate(rules, {
        operation,
        principal: principal({ tenantId: "other" }),
      }).allowed,
      false,
    );
    assert.equal(
      evaluate(rules, { operation, principal: principal({ roles: [] }) })
        .allowed,
      false,
    );
    assert.equal(
      evaluate(rules, { operation, project: "lp-infra" }).allowed,
      false,
    );
  }
});

test("near-miss spellings of the new operations are still refused", () => {
  for (const operation of [
    "Read",
    "READ",
    " read",
    "read ",
    "Cancel",
    "cancel\n",
    "reads",
    "request_execution",
    "read-only",
  ]) {
    assert.equal(
      validateConfiguredInboundAclRules([rule({ operations: [operation] })]),
      false,
      JSON.stringify(operation),
    );
  }
  // an unknown operation requested at evaluation time is never granted
  assert.equal(
    evaluate([rule({ operations: ["read", "cancel", "dry-run", "execute"] })], {
      operation: "write",
    }).allowed,
    false,
  );
});
