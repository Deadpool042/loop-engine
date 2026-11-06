/**
 * Inbound ACL operation vocabulary (L7.2 / E3), strictly additive.
 *
 * `dry-run` and `execute` are the existing public-request modes and keep their
 * meaning. `read` (state inspection) and `cancel` are ADDED; nothing is
 * renamed and nothing is granted by default: an ACL rule grants exactly the
 * operations it lists. The values are inert until a durable-gateway boundary
 * (E4) consumes them: the public request path only ever carries `dry-run` and
 * `execute`, so `read` and `cancel` can never match its mode.
 */

import type { LoopRuntimePublicRequest } from "../core/loop-runtime-public-request.js";

export const INBOUND_OPERATIONS = [
  "dry-run",
  "execute",
  "read",
  "cancel",
] as const;

export type InboundOperation =
  LoopRuntimePublicRequest["mode"] | "read" | "cancel";

// Compile-time guard: the tuple and the union must describe the same set.
type TupleMembers = (typeof INBOUND_OPERATIONS)[number];
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
export const INBOUND_OPERATIONS_MATCH_UNION: Exactly<
  TupleMembers,
  InboundOperation
> = true;

export function isInboundOperation(value: unknown): value is InboundOperation {
  return (
    typeof value === "string" &&
    (INBOUND_OPERATIONS as readonly string[]).includes(value)
  );
}
