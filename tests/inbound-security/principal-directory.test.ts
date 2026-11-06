import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOUND_PRINCIPAL_DIRECTORY_DENY_REASONS,
  createConfiguredInboundPrincipalDirectory,
  resolveConfiguredInboundPrincipal,
  validateConfiguredInboundPrincipalDirectory,
} from "../../src/inbound-security/principal-directory.js";

const entry = (overrides: Record<string, unknown> = {}) => ({
  principalId: "p-alice",
  principalType: "user",
  tenantId: "tenant-a",
  roles: ["operator"],
  ...overrides,
});

const directory = () => [
  entry(),
  entry({ principalId: "p-bob", tenantId: null, roles: ["reader", "release"] }),
];

test("a declared principal resolves to its configured tenant and roles", () => {
  const result = resolveConfiguredInboundPrincipal(directory(), "p-alice");
  assert.equal(result.resolved, true);
  assert.deepEqual(result.resolved ? result.principal : null, {
    principalId: "p-alice",
    principalType: "user",
    tenantId: "tenant-a",
    roles: ["operator"],
  });
  const bob = resolveConfiguredInboundPrincipal(directory(), "p-bob");
  assert.equal(bob.resolved && bob.principal.tenantId, null);
});

test("an unknown principal is refused and nothing is guessed", () => {
  for (const id of [
    "p-carol",
    "P-ALICE",
    "p-alice2",
    "p-alic",
    "toString",
    "constructor",
    "hasOwnProperty",
    "__proto__",
  ]) {
    assert.deepEqual(
      resolveConfiguredInboundPrincipal(directory(), id),
      {
        resolved: false,
        reason: "principal_unknown",
      },
      id,
    );
  }
});

test("a non-canonical identifier is refused, never normalized", () => {
  for (const id of [
    "",
    " p-alice",
    "p-alice ",
    "p-alice\n",
    "p-\talice",
    "p-\u0000alice",
    5,
    null,
    undefined,
    {},
    ["p-alice"],
    { principalId: "p-alice", roles: ["admin"] },
  ]) {
    assert.deepEqual(
      resolveConfiguredInboundPrincipal(directory(), id),
      {
        resolved: false,
        reason: "principal_id_invalid",
      },
      JSON.stringify(id),
    );
  }
});

test("a prototype-looking identifier resolves only when it is declared", () => {
  const entries = [entry({ principalId: "__proto__" })];
  const result = resolveConfiguredInboundPrincipal(entries, "__proto__");
  assert.equal(result.resolved && result.principal.tenantId, "tenant-a");
  assert.equal(
    resolveConfiguredInboundPrincipal(directory(), "__proto__").resolved,
    false,
  );
});

test("hostile arrays and objects are refused or read once, never trusted", () => {
  // accessor element inside roles
  const roles = ["operator"];
  Object.defineProperty(roles, 0, { enumerable: true, get: () => "operator" });
  assert.equal(
    validateConfiguredInboundPrincipalDirectory([entry({ roles })]),
    false,
  );
  // a revoked proxy and a proxy that throws never escape as exceptions
  const revoked = Proxy.revocable([entry()], {});
  revoked.revoke();
  assert.equal(
    validateConfiguredInboundPrincipalDirectory(revoked.proxy),
    false,
  );
  const throwing = new Proxy([entry()], {
    get() {
      throw new Error("boom");
    },
  });
  assert.equal(validateConfiguredInboundPrincipalDirectory(throwing), false);
  assert.deepEqual(resolveConfiguredInboundPrincipal(throwing, "p-alice"), {
    resolved: false,
    reason: "principal_directory_invalid",
  });
  // one roles array shared by two entries: mutation afterwards leaks nowhere
  const shared = ["r"];
  const port = createConfiguredInboundPrincipalDirectory([
    entry({ principalId: "p-1", roles: shared }),
    entry({ principalId: "p-2", roles: shared }),
  ]);
  shared.push("admin");
  assert.deepEqual(port.resolve("p-1")?.roles, ["r"]);
  assert.deepEqual(port.resolve("p-2")?.roles, ["r"]);
  assert.notEqual(port.resolve("p-1")?.roles, port.resolve("p-2")?.roles);
});

test("empty, malformed or ambiguous configurations are refused as a whole", () => {
  const sparseEntries = [entry(), , entry({ principalId: "p-x" })] as unknown[];
  const sparseRoles = entry({ roles: ["a", , "b"] });
  const withGetter = Object.defineProperty(entry(), "tenantId", {
    enumerable: true,
    get: () => "tenant-a",
  });
  const withSymbol = Object.assign(entry(), { [Symbol("x")]: 1 });
  const bad: Array<[string, unknown]> = [
    ["not an array", { 0: entry() }],
    ["undefined", undefined],
    ["null", null],
    ["empty", []],
    ["duplicate id (identical)", [entry(), entry()]],
    [
      "duplicate id (different tenant: ambiguous)",
      [entry(), entry({ tenantId: "tenant-b" })],
    ],
    [
      "missing key",
      [
        (() => {
          const { roles: _r, ...rest } = entry();
          return rest;
        })(),
      ],
    ],
    ["extra key", [entry({ admin: true })]],
    ["getter property", [withGetter]],
    ["symbol key", [withSymbol]],
    [
      "non-plain object",
      [Object.assign(Object.create({ inherited: 1 }), entry())],
    ],
    ["null entry", [null]],
    ["array entry", [[entry()]]],
    ["sparse entries", sparseEntries],
    ["sparse roles", [sparseRoles]],
    ["empty roles", [entry({ roles: [] })]],
    ["duplicate roles", [entry({ roles: ["a", "a"] })]],
    ["role with surrounding space", [entry({ roles: [" a"] })]],
    ["non-string role", [entry({ roles: [1] })]],
    ["roles not an array", [entry({ roles: "operator" })]],
    ["empty tenant", [entry({ tenantId: "" })]],
    ["undefined tenant", [entry({ tenantId: undefined })]],
    ["numeric tenant", [entry({ tenantId: 3 })]],
    ["empty type", [entry({ principalType: "" })]],
    ["padded id", [entry({ principalId: "p-alice " })]],
    ["empty id", [entry({ principalId: "" })]],
  ];
  for (const [label, entries] of bad) {
    assert.equal(
      validateConfiguredInboundPrincipalDirectory(entries),
      false,
      label,
    );
    assert.deepEqual(
      resolveConfiguredInboundPrincipal(entries, "p-alice"),
      {
        resolved: false,
        reason: "principal_directory_invalid",
      },
      label,
    );
    assert.throws(
      () => createConfiguredInboundPrincipalDirectory(entries),
      TypeError,
      label,
    );
  }
  assert.equal(validateConfiguredInboundPrincipalDirectory(directory()), true);
});

test("a configuration problem wins over an unknown id", () => {
  assert.equal(
    resolveConfiguredInboundPrincipal([entry(), entry()], "someone-else")
      .reason,
    "principal_directory_invalid",
  );
});

test("the port returns the same data, null for unknown or invalid ids", () => {
  const port = createConfiguredInboundPrincipalDirectory(directory());
  assert.equal(port.resolve("p-alice")?.tenantId, "tenant-a");
  assert.equal(port.resolve("p-nobody"), null);
  for (const id of ["", " p-alice", 3, null, undefined] as unknown[]) {
    assert.equal(port.resolve(id as string), null, String(id));
  }
});

test("the resolved principal and the port are immutable and independent of the source", () => {
  const source = directory();
  const port = createConfiguredInboundPrincipalDirectory(source);
  const principal = port.resolve("p-alice")!;
  assert.throws(() => {
    (principal as { tenantId: string | null }).tenantId = "tenant-b";
  }, TypeError);
  assert.throws(() => {
    (principal.roles as string[]).push("admin");
  }, TypeError);
  assert.throws(() => {
    (port as { resolve: unknown }).resolve = () => null;
  }, TypeError);
  // mutating the caller's configuration afterwards changes nothing
  (source[0]!.roles as string[]).push("admin");
  source[0]!.tenantId = "tenant-evil";
  source.push(entry({ principalId: "p-mallory" }));
  assert.deepEqual(port.resolve("p-alice")?.roles, ["operator"]);
  assert.equal(port.resolve("p-alice")?.tenantId, "tenant-a");
  assert.equal(port.resolve("p-mallory"), null);
});

test("deny reasons are the documented closed set", () => {
  assert.deepEqual(
    [...INBOUND_PRINCIPAL_DIRECTORY_DENY_REASONS],
    [
      "principal_directory_invalid",
      "principal_id_invalid",
      "principal_unknown",
    ],
  );
});
