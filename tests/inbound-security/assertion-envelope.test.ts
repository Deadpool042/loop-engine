import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOUND_ASSERTION_PAYLOAD_FIELDS,
  isCanonicalInstant,
  parseInboundAssertionEnvelope,
} from "../../src/inbound-security/assertion-envelope.js";

const LIMITS = { maxBytes: 4096 } as const;

const payload = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  issuer: "lp-control",
  keyId: "key-1",
  audience: "loop-engine-local",
  sub: "p-alice",
  jti: "0123456789abcdef0123456789abcdef",
  issuedAt: "2026-11-06T10:00:00.000Z",
  validFrom: "2026-11-06T10:00:00.000Z",
  expiresAt: "2026-11-06T10:01:00.000Z",
  requestId: "req-1",
  project: "creatyss",
  operation: "read",
  ...overrides,
});

const wire = (
  p: Record<string, unknown> = payload(),
  signature: unknown = "c2ln",
) => JSON.stringify({ payload: p, signature });

const parse = (raw: unknown, ...limits: unknown[]) =>
  parseInboundAssertionEnvelope(
    raw,
    (limits.length === 0 ? LIMITS : limits[0]) as never,
  );

const MALFORMED = { parsed: false, reason: "assertion_malformed" };

test("a well-formed compact envelope is parsed into a frozen structure", () => {
  const result = parse(wire());
  assert.equal(result.parsed, true);
  if (!result.parsed) return;
  assert.deepEqual(result.envelope.payload, payload());
  assert.equal(result.envelope.signature, "c2ln");
  assert.ok(Object.isFrozen(result.envelope));
  assert.ok(Object.isFrozen(result.envelope.payload));
  assert.deepEqual(Object.keys(result.envelope.payload), [
    ...INBOUND_ASSERTION_PAYLOAD_FIELDS,
  ]);
});

test("the size limit is an explicit input and is checked before parsing", () => {
  for (const limits of [
    undefined,
    null,
    {},
    { maxBytes: 0 },
    { maxBytes: -1 },
    { maxBytes: 1.5 },
    { maxBytes: NaN },
    { maxBytes: "4096" },
    { maxBytes: Infinity },
  ]) {
    assert.deepEqual(parse(wire(), limits), MALFORMED, JSON.stringify(limits));
  }
  const raw = wire();
  const size = new TextEncoder().encode(raw).length;
  assert.equal(parse(raw, { maxBytes: size }).parsed, true);
  assert.deepEqual(parse(raw, { maxBytes: size - 1 }), {
    parsed: false,
    reason: "assertion_too_large",
  });
  // too large wins over malformed: the content is not even looked at
  assert.deepEqual(parse("{".repeat(100), { maxBytes: 10 }), {
    parsed: false,
    reason: "assertion_too_large",
  });
  // the bound counts UTF-8 bytes, not characters
  const accented = wire(payload({ issuer: "é".repeat(10) }));
  const bytes = new TextEncoder().encode(accented).length;
  assert.ok(bytes > accented.length);
  assert.equal(parse(accented, { maxBytes: bytes }).parsed, true);
  assert.equal(parse(accented, { maxBytes: accented.length }).parsed, false);
});

test("non-string input is malformed", () => {
  for (const raw of [
    undefined,
    null,
    1,
    {},
    [],
    Buffer.from(wire()),
    new String(wire()),
  ]) {
    assert.deepEqual(parse(raw), MALFORMED);
  }
});

test("only the closed key sets are accepted: no role, tenant, right or algorithm", () => {
  for (const extra of [
    "role",
    "roles",
    "tenant",
    "tenantId",
    "rights",
    "permissions",
    "scope",
    "admin",
    "alg",
    "algorithm",
    "typ",
    "iss",
    "exp",
    "nonce",
    "signature",
    "metadata",
    "__proto__",
    "constructor",
  ]) {
    assert.deepEqual(
      parse(wire(payload({ [extra]: "x" }))),
      MALFORMED,
      `payload.${extra}`,
    );
    if (extra === "signature") continue; // a root `signature` is the legitimate key
    const root = JSON.stringify({
      payload: payload(),
      signature: "s",
      [extra]: "x",
    });
    assert.deepEqual(parse(root), MALFORMED, `root.${extra}`);
  }
  for (const missing of INBOUND_ASSERTION_PAYLOAD_FIELDS) {
    const { [missing]: _removed, ...rest } = payload() as Record<
      string,
      unknown
    >;
    assert.deepEqual(parse(wire(rest)), MALFORMED, `missing ${missing}`);
  }
  assert.deepEqual(parse(JSON.stringify({ payload: payload() })), MALFORMED);
  assert.deepEqual(parse(JSON.stringify({ signature: "s" })), MALFORMED);
});

test("duplicate keys are refused at every level", () => {
  const base = wire();
  assert.deepEqual(
    parse(
      base.replace(
        '"project":"creatyss"',
        '"project":"creatyss","project":"lp-infra"',
      ),
    ),
    MALFORMED,
  );
  assert.deepEqual(
    parse(
      base.replace(
        '"project":"creatyss"',
        '"project":"lp-infra","project":"creatyss"',
      ),
    ),
    MALFORMED,
  );
  assert.deepEqual(
    parse(
      base.replace(
        '"signature":"c2ln"',
        '"signature":"c2ln","signature":"c2ln"',
      ),
    ),
    MALFORMED,
  );
  assert.deepEqual(
    parse(base.replace('{"payload"', '{"payload":{},"payload"')),
    MALFORMED,
  );
  // distinct escapes of the same key are still the same key
  assert.deepEqual(
    parse(
      base.replace(
        '"project":"creatyss"',
        '"project":"creatyss","pro\\u006aect":"x"',
      ),
    ),
    MALFORMED,
  );
});

test("strict JSON: no whitespace, BOM, trailing content, arrays, null, booleans or numbers elsewhere", () => {
  const base = wire();
  const bad: Array<[string, string]> = [
    ["leading space", ` ${base}`],
    ["trailing space", `${base} `],
    ["trailing newline", `${base}\n`],
    ["trailing content", `${base}{}`],
    ["BOM", `﻿${base}`],
    ["space after colon", base.replace('"version":1', '"version": 1')],
    ["empty", ""],
    ["truncated", base.slice(0, -1)],
    ["array root", "[]"],
    ["string root", '"x"'],
    ["number root", "1"],
    ["null root", "null"],
    [
      "array value",
      base.replace('"issuer":"lp-control"', '"issuer":["lp-control"]'),
    ],
    ["null value", base.replace('"issuer":"lp-control"', '"issuer":null')],
    ["boolean value", base.replace('"issuer":"lp-control"', '"issuer":true')],
    [
      "nested object",
      base.replace('"issuer":"lp-control"', '"issuer":{"a":"b"}'),
    ],
    [
      "number as text field",
      base.replace('"issuer":"lp-control"', '"issuer":5'),
    ],
    [
      "trailing comma",
      base.replace('"signature":"c2ln"}', '"signature":"c2ln",}'),
    ],
    ["single quotes", base.replace(/"/g, "'")],
    ["raw newline in string", base.replace("lp-control", "lp-\ncontrol")],
    ["raw tab in string", base.replace("lp-control", "lp-\tcontrol")],
    ["invalid escape", base.replace("lp-control", "lp-\\xcontrol")],
    ["short unicode escape", base.replace("lp-control", "lp-\\u12control")],
    ["unterminated string", base.replace('"c2ln"}', '"c2ln}')],
  ];
  for (const [label, raw] of bad) {
    assert.deepEqual(parse(raw), MALFORMED, label);
  }
});

test("version must be exactly the integer 1", () => {
  for (const v of [
    "2",
    "0",
    "01",
    "1.0",
    "1e0",
    "-1",
    '"1"',
    "true",
    "null",
    "[1]",
    "100000000000000000",
  ]) {
    const raw = wire().replace('"version":1', `"version":${v}`);
    assert.deepEqual(parse(raw), MALFORMED, v);
  }
});

test("text fields must be canonical", () => {
  for (const field of [
    "issuer",
    "keyId",
    "audience",
    "sub",
    "jti",
    "requestId",
  ]) {
    for (const value of [
      "",
      " a",
      "a ",
      "a\u0000b",
      "a\nb",
      "a\tb",
      "a\u0085b",
      "a ",
      "\ud800",
      "a\udc00b",
      5,
      null,
    ]) {
      assert.deepEqual(
        parse(wire(payload({ [field]: value }))),
        MALFORMED,
        `${field}=${JSON.stringify(value)}`,
      );
    }
  }
  // an unpaired surrogate written as an escape is refused; a valid pair is not
  const lone = wire().replace("lp-control", "lp-\\ud800");
  assert.deepEqual(parse(lone), MALFORMED);
  assert.equal(parse(wire(payload({ issuer: "lp-\u{1F600}" }))).parsed, true);
});

test("project follows the registry rule and operation the ACL vocabulary", () => {
  for (const project of [
    "Creatyss",
    "creatyss ",
    "*",
    "",
    "a b",
    "../x",
    "a".repeat(64),
  ]) {
    assert.deepEqual(parse(wire(payload({ project }))), MALFORMED, project);
  }
  for (const operation of [
    "write",
    "READ",
    "read ",
    "request_execution",
    "",
    "*",
  ]) {
    assert.deepEqual(parse(wire(payload({ operation }))), MALFORMED, operation);
  }
  for (const operation of ["dry-run", "execute", "read", "cancel"]) {
    assert.equal(parse(wire(payload({ operation }))).parsed, true, operation);
  }
});

test("instants have a single canonical textual form", () => {
  assert.equal(isCanonicalInstant("2026-11-06T10:00:00.000Z"), true);
  for (const value of [
    "2026-11-06T10:00:00Z",
    "2026-11-06T10:00:00.0Z",
    "2026-11-06T10:00:00.000+00:00",
    "2026-11-06T10:00:00.000z",
    "2026-11-06 10:00:00.000Z",
    "2026-02-30T10:00:00.000Z",
    "2026-13-01T10:00:00.000Z",
    "2026-11-06T24:00:00.000Z",
    "2026-11-06T10:00:00.000Z ",
    " 2026-11-06T10:00:00.000Z",
    "06 Nov 2026 10:00:00 GMT",
    "1762423200000",
    "",
    5,
    null,
  ]) {
    assert.equal(isCanonicalInstant(value), false, String(value));
  }
  for (const field of ["issuedAt", "validFrom", "expiresAt"]) {
    assert.deepEqual(
      parse(wire(payload({ [field]: "2026-11-06T10:00:00Z" }))),
      MALFORMED,
      field,
    );
  }
});

test("signature is opaque canonical text: never decoded, never an algorithm selector", () => {
  assert.equal(parse(wire(payload(), "not-base64-at-all!!")).parsed, true);
  for (const signature of ["", " s", "s ", "s\n", 5, null, ["s"], {}]) {
    assert.deepEqual(
      parse(wire(payload(), signature)),
      MALFORMED,
      JSON.stringify(signature),
    );
  }
});

test("deep nesting and prototype-looking keys are refused", () => {
  assert.deepEqual(
    parse('{"payload":{"a":{"b":{}}},"signature":"s"}'),
    MALFORMED,
  );
  assert.deepEqual(
    parse('{"__proto__":{"payload":1},"payload":{},"signature":"s"}'),
    MALFORMED,
  );
  assert.deepEqual(
    parse(wire().replace('"operation":"read"', '"__proto__":"x"')),
    MALFORMED,
  );
  assert.equal(({} as Record<string, unknown>).payload, undefined);
});

test("every refusal is uniform: no detail about what was wrong", () => {
  const reasons = new Set<string>();
  for (const raw of [
    "",
    "{",
    "[]",
    wire(payload({ project: "X" })),
    wire(payload({ role: "admin" })),
    wire(payload({ version: 2 })),
  ]) {
    const result = parse(raw);
    assert.equal(result.parsed, false);
    if (!result.parsed) reasons.add(JSON.stringify(result));
  }
  assert.equal(reasons.size, 1);
});
