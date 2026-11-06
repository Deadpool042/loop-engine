import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOUND_ASSERTION_PAYLOAD_FIELDS,
  parseInboundAssertionEnvelope,
} from "../../src/inbound-security/assertion-envelope.js";
import {
  INBOUND_ASSERTION_SIGNING_DOMAIN,
  buildInboundAssertionSigningMessage,
} from "../../src/inbound-security/assertion-signing-message.js";

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

const EXPECTED = [
  "loop-engine/inbound-assertion/v1",
  "version=1",
  "issuer=lp-control",
  "keyId=key-1",
  "audience=loop-engine-local",
  "sub=p-alice",
  "jti=0123456789abcdef0123456789abcdef",
  "issuedAt=2026-11-06T10:00:00.000Z",
  "validFrom=2026-11-06T10:00:00.000Z",
  "expiresAt=2026-11-06T10:01:00.000Z",
  "requestId=req-1",
  "project=creatyss",
  "operation=read",
].join("\n");

test("the message matches the fixed test vector byte for byte", () => {
  const result = buildInboundAssertionSigningMessage(payload());
  assert.equal(result.built, true);
  if (!result.built) return;
  assert.equal(result.message, EXPECTED);
  assert.deepEqual([...result.bytes], [...new TextEncoder().encode(EXPECTED)]);
  assert.equal(
    INBOUND_ASSERTION_SIGNING_DOMAIN,
    "loop-engine/inbound-assertion/v1",
  );
  assert.ok(Object.isFrozen(result));
});

test("the order of the caller's keys never changes the message", () => {
  const forward = payload();
  const reversed = Object.fromEntries(Object.entries(forward).reverse());
  const a = buildInboundAssertionSigningMessage(forward);
  const b = buildInboundAssertionSigningMessage(reversed);
  assert.equal(a.built && b.built && a.message === b.message, true);
});

test("an invalid payload never produces a message", () => {
  const { sub: _sub, ...missing } = payload();
  const bad: unknown[] = [
    undefined,
    null,
    "payload",
    1,
    [],
    missing,
    payload({ signature: "s" }),
    payload({ role: "admin" }),
    payload({ tenantId: "t" }),
    payload({ version: 2 }),
    payload({ sub: "a\nproject=lp-infra" }),
    payload({ sub: " a" }),
    payload({ project: "Creatyss" }),
    payload({ operation: "write" }),
    payload({ issuedAt: "2026-11-06T10:00:00Z" }),
    Object.defineProperty(payload(), "sub", {
      enumerable: true,
      get: () => "p-alice",
    }),
  ];
  for (const value of bad) {
    assert.deepEqual(buildInboundAssertionSigningMessage(value), {
      built: false,
      reason: "payload_invalid",
    });
  }
});

test("the signature is not part of the message and cannot be smuggled into it", () => {
  const withSignature = buildInboundAssertionSigningMessage({
    ...payload(),
    signature: "s",
  });
  assert.equal(withSignature.built, false);
  const parsed = parseInboundAssertionEnvelope(
    JSON.stringify({ payload: payload(), signature: "anything" }),
    { maxBytes: 4096 },
  );
  assert.equal(parsed.parsed, true);
  if (!parsed.parsed) return;
  const built = buildInboundAssertionSigningMessage(parsed.envelope.payload);
  assert.equal(built.built && built.message === EXPECTED, true);
  assert.equal(built.built && built.message.includes("anything"), false);
});

test("every field is covered: changing any one field changes the message", () => {
  const base = buildInboundAssertionSigningMessage(payload());
  assert.equal(base.built, true);
  const variants: Record<string, unknown> = {
    issuer: "other",
    keyId: "key-2",
    audience: "other",
    sub: "p-bob",
    jti: "f".repeat(32),
    issuedAt: "2026-11-06T10:00:00.001Z",
    validFrom: "2026-11-06T10:00:00.001Z",
    expiresAt: "2026-11-06T10:01:00.001Z",
    requestId: "req-2",
    project: "lp-infra",
    operation: "cancel",
  };
  for (const field of INBOUND_ASSERTION_PAYLOAD_FIELDS) {
    if (field === "version") continue;
    const changed = buildInboundAssertionSigningMessage(
      payload({ [field]: variants[field] }),
    );
    assert.equal(changed.built, true, field);
    assert.notEqual(
      changed.built && base.built && changed.message,
      base.built && base.message,
      field,
    );
  }
});

test("values containing separators cannot forge another field", () => {
  const withEquals = buildInboundAssertionSigningMessage(
    payload({ sub: "a=b" }),
  );
  const withField = buildInboundAssertionSigningMessage(
    payload({ sub: "x project=lp-infra" }),
  );
  assert.equal(withEquals.built, true);
  assert.equal(withField.built, true);
  if (withField.built) {
    // exactly one `project=` line, the real one
    assert.equal(
      withField.message.split("\n").filter((l) => l.startsWith("project="))
        .length,
      1,
    );
    assert.equal(withField.message.split("\n").length, 13);
  }
});

test("injectivity: distinct payloads never share a message, and the message decodes back", () => {
  let seed = 12345;
  const next = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const alphabet = [
    "a",
    "b",
    "=",
    ":",
    " ",
    "-",
    "é",
    "\u{1F600}",
    "project",
    "x=y",
  ];
  const text = () => {
    let out = "";
    for (let i = 0, n = 1 + next(6); i < n; i += 1)
      out += alphabet[next(alphabet.length)];
    return out.trim() === "" || out !== out.trim() ? "t" + out.trim() : out;
  };
  const operations = ["dry-run", "execute", "read", "cancel"];
  const seen = new Map<string, string>();
  for (let i = 0; i < 400; i += 1) {
    const candidate = payload({
      issuer: text(),
      keyId: text(),
      audience: text(),
      sub: text(),
      jti: text(),
      requestId: text(),
      project: ["creatyss", "lp-infra", "n8n"][next(3)],
      operation: operations[next(4)],
    });
    const built = buildInboundAssertionSigningMessage(candidate);
    assert.equal(built.built, true, JSON.stringify(candidate));
    if (!built.built) continue;
    const identity = JSON.stringify(candidate);
    const previous = seen.get(built.message);
    assert.ok(
      previous === undefined || previous === identity,
      "collision between distinct payloads",
    );
    seen.set(built.message, identity);
    // decode: every line after the domain is `<field>=<value>` in fixed order
    const lines = built.message.split("\n");
    assert.equal(lines.length, INBOUND_ASSERTION_PAYLOAD_FIELDS.length + 1);
    INBOUND_ASSERTION_PAYLOAD_FIELDS.forEach((field, index) => {
      const line = lines[index + 1]!;
      assert.ok(line.startsWith(`${field}=`));
      const value = line.slice(field.length + 1);
      assert.equal(
        value,
        String((candidate as Record<string, unknown>)[field]),
      );
    });
  }
});
