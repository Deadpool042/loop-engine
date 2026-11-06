import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOUND_SERVICE_CEILING_DENY_REASONS,
  evaluateServiceCeiling,
  validateInboundServiceCeilingRules,
} from "../../src/inbound-security/service-ceiling.js";

const rule = (overrides: Record<string, unknown> = {}) => ({
  keyId: "svc-key-1",
  projects: ["creatyss"],
  operations: ["read"],
  ...overrides,
});

const evaluate = (
  rules: unknown,
  overrides: Partial<Record<"keyId" | "project" | "operation", unknown>> = {},
) =>
  evaluateServiceCeiling({
    keyId: "svc-key-1",
    project: "creatyss",
    operation: "read",
    ...overrides,
    rules,
  });

test("an exact key, project and operation inside the ceiling is allowed", () => {
  assert.deepEqual(evaluate([rule()]), { allowed: true, keyId: "svc-key-1" });
});

test("the ceiling is EMPTY by default: no rule means every request is denied", () => {
  assert.equal(validateInboundServiceCeilingRules([]), true);
  assert.deepEqual(evaluate([]), { allowed: false, reason: "service_unknown" });
});

test("an explicit empty ceiling for a known service also denies everything", () => {
  const rules = [rule({ projects: [], operations: [] })];
  assert.equal(validateInboundServiceCeilingRules(rules), true);
  assert.deepEqual(evaluate(rules), {
    allowed: false,
    reason: "service_project_not_authorized",
  });
  const projectsOnly = [rule({ operations: [] })];
  assert.deepEqual(evaluate(projectsOnly), {
    allowed: false,
    reason: "service_operation_not_authorized",
  });
});

test("denials are distinct and ordered: service, project, operation", () => {
  const rules = [rule({ operations: ["read", "cancel"] })];
  assert.deepEqual(evaluate(rules, { keyId: "other" }), {
    allowed: false,
    reason: "service_unknown",
  });
  assert.deepEqual(evaluate(rules, { project: "lp-infra" }), {
    allowed: false,
    reason: "service_project_not_authorized",
  });
  assert.deepEqual(evaluate(rules, { operation: "execute" }), {
    allowed: false,
    reason: "service_operation_not_authorized",
  });
  assert.deepEqual(
    evaluate(rules, {
      keyId: "other",
      project: "lp-infra",
      operation: "execute",
    }),
    { allowed: false, reason: "service_unknown" },
  );
  assert.deepEqual(
    evaluate(rules, { project: "lp-infra", operation: "execute" }),
    { allowed: false, reason: "service_project_not_authorized" },
  );
});

test("matching is exact: no case folding, no trimming, no wildcard, no prefix", () => {
  const rules = [rule()];
  for (const keyId of [
    "SVC-KEY-1",
    "svc-key-1 ",
    " svc-key-1",
    "svc-key",
    "svc-key-12",
    "*",
    "",
    "svc-key-1\n",
  ]) {
    assert.equal(
      evaluate(rules, { keyId }).allowed,
      false,
      JSON.stringify(keyId),
    );
  }
  for (const project of [
    "Creatyss",
    "creatyss ",
    "creatyss-2",
    "creat",
    "*",
    "",
  ]) {
    assert.equal(
      evaluate(rules, { project }).allowed,
      false,
      JSON.stringify(project),
    );
  }
  for (const operation of ["READ", "read ", "reads", "*", "", "write"]) {
    assert.equal(
      evaluate(rules, { operation }).allowed,
      false,
      JSON.stringify(operation),
    );
  }
});

test("non-string inputs are denied, never coerced", () => {
  const rules = [rule()];
  for (const value of [
    undefined,
    null,
    1,
    {},
    ["svc-key-1"],
    new String("svc-key-1"),
  ]) {
    assert.equal(evaluate(rules, { keyId: value }).allowed, false);
    assert.equal(evaluate(rules, { project: value }).allowed, false);
    assert.equal(evaluate(rules, { operation: value }).allowed, false);
  }
});

test("each service only gets its own projects and operations", () => {
  const rules = [
    rule({ keyId: "svc-a", projects: ["creatyss"], operations: ["read"] }),
    rule({ keyId: "svc-b", projects: ["lp-infra"], operations: ["cancel"] }),
  ];
  assert.equal(evaluate(rules, { keyId: "svc-a" }).allowed, true);
  assert.equal(
    evaluate(rules, { keyId: "svc-a", project: "lp-infra" }).allowed,
    false,
  );
  assert.equal(
    evaluate(rules, {
      keyId: "svc-b",
      project: "lp-infra",
      operation: "cancel",
    }).allowed,
    true,
  );
  assert.equal(
    evaluate(rules, {
      keyId: "svc-b",
      project: "creatyss",
      operation: "cancel",
    }).allowed,
    false,
  );
  assert.equal(
    evaluate(rules, { keyId: "svc-b", project: "lp-infra", operation: "read" })
      .allowed,
    false,
  );
});

test("malformed or ambiguous ceilings are refused as a whole", () => {
  const withGetter = Object.defineProperty(rule(), "projects", {
    enumerable: true,
    get: () => ["creatyss"],
  });
  const bad: Array<[string, unknown]> = [
    ["not an array", { 0: rule() }],
    ["undefined", undefined],
    ["null", null],
    ["duplicate keyId", [rule(), rule({ projects: ["lp-infra"] })]],
    ["wildcard project", [rule({ projects: ["*"] })]],
    ["non-registry project", [rule({ projects: ["Creatyss"] })]],
    ["padded project", [rule({ projects: ["creatyss "] })]],
    ["duplicate projects", [rule({ projects: ["creatyss", "creatyss"] })]],
    ["unknown operation", [rule({ operations: ["write"] })]],
    ["wildcard operation", [rule({ operations: ["*"] })]],
    ["duplicate operations", [rule({ operations: ["read", "read"] })]],
    ["empty keyId", [rule({ keyId: "" })]],
    ["padded keyId", [rule({ keyId: "svc-key-1 " })]],
    ["numeric keyId", [rule({ keyId: 1 })]],
    [
      "missing key",
      [
        (() => {
          const { operations: _o, ...rest } = rule();
          return rest;
        })(),
      ],
    ],
    ["extra key (role)", [rule({ roles: ["admin"] })]],
    ["extra key (allow)", [rule({ allow: true })]],
    ["getter", [withGetter]],
    [
      "non-plain object",
      [Object.assign(Object.create({ inherited: 1 }), rule())],
    ],
    ["null entry", [null]],
    ["sparse rules", [rule(), , rule({ keyId: "svc-2" })]],
    ["sparse projects", [rule({ projects: ["creatyss", , "lp-infra"] })]],
    ["sparse operations", [rule({ operations: ["read", , "cancel"] })]],
    ["projects not an array", [rule({ projects: "creatyss" })]],
  ];
  for (const [label, rules] of bad) {
    assert.equal(validateInboundServiceCeilingRules(rules), false, label);
    assert.deepEqual(
      evaluate(rules),
      { allowed: false, reason: "ceiling_configuration_invalid" },
      label,
    );
  }
});

test("a configuration problem wins over an unknown service", () => {
  assert.equal(evaluate([rule(), rule()], { keyId: "nobody" }).allowed, false);
  assert.deepEqual(evaluate([rule(), rule()], { keyId: "nobody" }), {
    allowed: false,
    reason: "ceiling_configuration_invalid",
  });
});

test("the deny reasons are the documented closed set", () => {
  assert.deepEqual(
    [...INBOUND_SERVICE_CEILING_DENY_REASONS],
    [
      "ceiling_configuration_invalid",
      "service_unknown",
      "service_project_not_authorized",
      "service_operation_not_authorized",
    ],
  );
});
