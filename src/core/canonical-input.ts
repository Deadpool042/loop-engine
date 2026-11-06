/**
 * Canonical input for durable-execution identifiers (L7.1 / E5).
 *
 * One pure predicate shared by every boundary (gateway decoding and durable
 * controller). The rule is REFUSAL, never normalization: an input that is not
 * canonical is rejected before any store access, so the same string always
 * designates the same record across execute, status, verify, cancel and list.
 *
 * Canonical text = a non-empty string that is equal to its own `trim()` (no
 * leading or trailing whitespace, whatever its Unicode form) and that contains
 * no control character (Unicode category Cc: C0, DEL, C1, which includes
 * tab, newline and NUL).
 *
 * Deliberately NOT part of this rule (open arbitration, see the L7.1 design):
 * a length bound and a restriction of the character set beyond control
 * characters. Project names additionally use the registry rule (E6).
 */

import { isValidProjectName } from "./project-identity.js";

const CONTROL_CHARACTER = /\p{Cc}/u;

export function isCanonicalInput(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value === value.trim() &&
    !CONTROL_CHARACTER.test(value)
  );
}

/** A project designation is canonical when it satisfies the registry name rule. */
export function isCanonicalProject(value: unknown): value is string {
  return isValidProjectName(value);
}
