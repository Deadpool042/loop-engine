/**
 * Canonical signing message of an inbound assertion (L7.3, no cryptography).
 *
 * Deterministic, injective text built from a validated payload. It is the exact
 * input a future signer/verifier will sign/check; THIS module signs and
 * verifies nothing and fixes no algorithm, key format or encoding of the
 * signature.
 *
 * Format (UTF-8 text, LF line endings):
 *   line 1 : "loop-engine/inbound-assertion/v1"        (domain separation + version)
 *   then one line per field, in the FIXED order of INBOUND_ASSERTION_PAYLOAD_FIELDS:
 *            "<field>=<value>"
 * Each value is canonical text (E5): non-empty, no control character, hence it
 * can never contain a line break, so a value cannot forge another line and two
 * different payloads can never produce the same message. The field set is
 * closed (no optional field), the order does not depend on the caller's object,
 * and the signature itself is never part of the message.
 */

import {
  INBOUND_ASSERTION_PAYLOAD_FIELDS,
  readInboundAssertionPayload,
} from "./assertion-envelope.js";

export const INBOUND_ASSERTION_SIGNING_DOMAIN =
  "loop-engine/inbound-assertion/v1" as const;

export type InboundAssertionSigningMessage =
  | Readonly<{ built: true; message: string; bytes: Uint8Array }>
  | Readonly<{ built: false; reason: "payload_invalid" }>;

const INVALID = Object.freeze({
  built: false as const,
  reason: "payload_invalid" as const,
});

/** The payload is re-validated here: a message is never built from unchecked data. */
export function buildInboundAssertionSigningMessage(
  payload: unknown,
): InboundAssertionSigningMessage {
  const valid = readInboundAssertionPayload(payload);
  if (valid === null) return INVALID;
  const lines: string[] = [INBOUND_ASSERTION_SIGNING_DOMAIN];
  for (const field of INBOUND_ASSERTION_PAYLOAD_FIELDS) {
    lines.push(`${field}=${String(valid[field])}`);
  }
  const message = lines.join("\n");
  return Object.freeze({
    built: true as const,
    message,
    bytes: new TextEncoder().encode(message),
  });
}
