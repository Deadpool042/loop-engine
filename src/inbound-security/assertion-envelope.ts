/**
 * Signed-assertion envelope: contract and STRICT parser (L7.3, no cryptography).
 *
 * The envelope is UNAUTHENTICATED data until a verifier (later lot, E1) checks
 * its signature. This module only turns a raw string into a fixed, frozen
 * structure, or refuses it. It decides no cryptographic parameter: the
 * signature is an opaque string (never decoded here), there is NO algorithm
 * field (the algorithm will be designated by Loop Engine's configuration, never
 * by the assertion), and the size limit is an explicit INPUT of the caller.
 *
 * Wire shape (JSON):
 *   { "payload": { version, issuer, keyId, audience, sub, jti, issuedAt,
 *                  validFrom, expiresAt, requestId, project, operation },
 *     "signature": "<opaque canonical text>" }
 *
 * The payload carries NO role, tenant or right: any other key is refused, so a
 * caller-provided authority can never ride in the assertion (O9 model B).
 *
 * Strictness (any violation => one uniform refusal, no detail): size bound
 * checked before parsing, no BOM/trailing content, no duplicate key at any
 * level (so that two parsers can never read two different assertions), no
 * unpaired surrogate, only objects/strings/the integer `1` for `version`,
 * exact key set, canonical text fields (E5), registry project name (E6),
 * `InboundOperation` (E3), instants in the canonical UTC form
 * `YYYY-MM-DDTHH:mm:ss.sssZ` (a single textual form per instant).
 */

import {
  isCanonicalInput,
  isCanonicalProject,
} from "../core/canonical-input.js";
import {
  isInboundOperation,
  type InboundOperation,
} from "./inbound-operation.js";

export const INBOUND_ASSERTION_VERSION = 1 as const;

export const INBOUND_ASSERTION_PAYLOAD_FIELDS = [
  "version",
  "issuer",
  "keyId",
  "audience",
  "sub",
  "jti",
  "issuedAt",
  "validFrom",
  "expiresAt",
  "requestId",
  "project",
  "operation",
] as const;

export type InboundAssertionPayload = Readonly<{
  version: typeof INBOUND_ASSERTION_VERSION;
  issuer: string;
  keyId: string;
  audience: string;
  sub: string;
  jti: string;
  issuedAt: string;
  validFrom: string;
  expiresAt: string;
  requestId: string;
  project: string;
  operation: InboundOperation;
}>;

export type InboundAssertionEnvelope = Readonly<{
  payload: InboundAssertionPayload;
  signature: string;
}>;

export type InboundAssertionParseLimits = Readonly<{
  /** Maximum size of the raw input in UTF-8 bytes. Required: no default is decided here. */
  maxBytes: number;
}>;

export type InboundAssertionParseResult =
  | Readonly<{ parsed: true; envelope: InboundAssertionEnvelope }>
  | Readonly<{
      parsed: false;
      reason: "assertion_too_large" | "assertion_malformed";
    }>;

const MALFORMED = Object.freeze({
  parsed: false as const,
  reason: "assertion_malformed" as const,
});
const TOO_LARGE = Object.freeze({
  parsed: false as const,
  reason: "assertion_too_large" as const,
});

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** True for the single canonical textual form of a valid UTC instant. */
export function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== "string" || !INSTANT.test(value)) return false;
  const time = Date.parse(value);
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

class Malformed extends Error {}

type JsonValue = string | number | { [key: string]: JsonValue };

/**
 * Minimal strict JSON reader for exactly what the envelope needs: objects,
 * strings and non-negative integers. Everything else (arrays, null, booleans,
 * fractions, exponents, signs) is refused, as are duplicate keys.
 */
class StrictReader {
  private index = 0;

  constructor(private readonly text: string) {}

  read(): JsonValue {
    const value = this.value(0);
    if (this.index !== this.text.length) throw new Malformed();
    return value;
  }

  private value(depth: number): JsonValue {
    const ch = this.text[this.index];
    if (ch === "{") return this.object(depth);
    if (ch === '"') return this.string();
    if (ch !== undefined && ch >= "0" && ch <= "9") return this.integer();
    throw new Malformed();
  }

  private object(depth: number): { [key: string]: JsonValue } {
    // payload nesting is the deepest legitimate shape: root(0) -> payload(1)
    if (depth > 1) throw new Malformed();
    this.index += 1; // {
    const result: { [key: string]: JsonValue } = Object.create(null) as {
      [key: string]: JsonValue;
    };
    if (this.text[this.index] === "}") {
      this.index += 1;
      return result;
    }
    for (;;) {
      if (this.text[this.index] !== '"') throw new Malformed();
      const key = this.string();
      if (Object.hasOwn(result, key)) throw new Malformed(); // duplicate key
      if (this.text[this.index] !== ":") throw new Malformed();
      this.index += 1;
      result[key] = this.value(depth + 1);
      const next = this.text[this.index];
      this.index += 1;
      if (next === "}") return result;
      if (next !== ",") throw new Malformed();
    }
  }

  private integer(): number {
    const start = this.index;
    while (this.index < this.text.length) {
      const ch = this.text[this.index]!;
      if (ch < "0" || ch > "9") break;
      this.index += 1;
    }
    const digits = this.text.slice(start, this.index);
    if (digits.length > 1 && digits.startsWith("0")) throw new Malformed();
    const next = this.text[this.index];
    if (next === "." || next === "e" || next === "E") throw new Malformed();
    if (digits.length > 15) throw new Malformed();
    return Number(digits);
  }

  private string(): string {
    this.index += 1; // opening quote
    let out = "";
    for (;;) {
      if (this.index >= this.text.length) throw new Malformed();
      const code = this.text.charCodeAt(this.index);
      const ch = this.text[this.index]!;
      if (ch === '"') {
        this.index += 1;
        return out;
      }
      if (code < 0x20) throw new Malformed(); // raw control character
      if (ch === "\\") {
        this.index += 1;
        const esc = this.text[this.index];
        this.index += 1;
        switch (esc) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const hex = this.text.slice(this.index, this.index + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Malformed();
            this.index += 4;
            out += String.fromCharCode(parseInt(hex, 16));
            break;
          }
          default:
            throw new Malformed();
        }
        continue;
      }
      out += ch;
      this.index += 1;
    }
  }
}

function hasUnpairedSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function hasOnlyKeys(value: object, keys: readonly string[]): boolean {
  const own = Reflect.ownKeys(value);
  return (
    own.length === keys.length &&
    own.every((key) => typeof key === "string" && keys.includes(key))
  );
}

/**
 * Validates an already-decoded payload object (shared by the parser and by the
 * canonical message builder, so both accept exactly the same payloads).
 * Returns a frozen copy in canonical field order, or `null`.
 */
export function readInboundAssertionPayload(
  value: unknown,
): InboundAssertionPayload | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return null;
    if (!hasOnlyKeys(value, INBOUND_ASSERTION_PAYLOAD_FIELDS)) return null;
    const field = (name: string): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      return descriptor !== undefined && Object.hasOwn(descriptor, "value")
        ? descriptor.value
        : undefined;
    };
    const version = field("version");
    const text = (name: string): string | null => {
      const v = field(name);
      return isCanonicalInput(v) && !hasUnpairedSurrogate(v) ? v : null;
    };
    const issuer = text("issuer");
    const keyId = text("keyId");
    const audience = text("audience");
    const sub = text("sub");
    const jti = text("jti");
    const requestId = text("requestId");
    const project = field("project");
    const operation = field("operation");
    const issuedAt = field("issuedAt");
    const validFrom = field("validFrom");
    const expiresAt = field("expiresAt");
    if (
      version !== INBOUND_ASSERTION_VERSION ||
      issuer === null ||
      keyId === null ||
      audience === null ||
      sub === null ||
      jti === null ||
      requestId === null ||
      !isCanonicalProject(project) ||
      !isInboundOperation(operation) ||
      !isCanonicalInstant(issuedAt) ||
      !isCanonicalInstant(validFrom) ||
      !isCanonicalInstant(expiresAt)
    ) {
      return null;
    }
    return Object.freeze({
      version: INBOUND_ASSERTION_VERSION,
      issuer,
      keyId,
      audience,
      sub,
      jti,
      issuedAt,
      validFrom,
      expiresAt,
      requestId,
      project,
      operation,
    });
  } catch {
    return null;
  }
}

export function parseInboundAssertionEnvelope(
  raw: unknown,
  limits: InboundAssertionParseLimits,
): InboundAssertionParseResult {
  if (
    typeof limits !== "object" ||
    limits === null ||
    !Number.isSafeInteger(limits.maxBytes) ||
    limits.maxBytes <= 0
  ) {
    return MALFORMED;
  }
  if (typeof raw !== "string") return MALFORMED;
  // Size is checked BEFORE any parsing work.
  if (
    raw.length > limits.maxBytes ||
    new TextEncoder().encode(raw).length > limits.maxBytes
  ) {
    return TOO_LARGE;
  }
  try {
    if (raw.charCodeAt(0) === 0xfeff || hasUnpairedSurrogate(raw))
      return MALFORMED;
    const root = new StrictReader(raw).read();
    if (
      typeof root !== "object" ||
      !hasOnlyKeys(root, ["payload", "signature"])
    ) {
      return MALFORMED;
    }
    const signature = root.signature;
    const payload = readInboundAssertionPayload(root.payload);
    if (
      payload === null ||
      !isCanonicalInput(signature) ||
      hasUnpairedSurrogate(signature)
    ) {
      return MALFORMED;
    }
    return Object.freeze({
      parsed: true as const,
      envelope: Object.freeze({ payload, signature }),
    });
  } catch {
    return MALFORMED;
  }
}
