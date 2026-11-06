import assert from "node:assert/strict";
import test from "node:test";

import {
  INBOUND_OPERATIONS,
  isInboundOperation,
} from "../../src/inbound-security/inbound-operation.js";

test("the vocabulary is exactly the existing modes plus read and cancel", () => {
  assert.deepEqual(
    [...INBOUND_OPERATIONS],
    ["dry-run", "execute", "read", "cancel"],
  );
});

test("only the four exact lowercase names are operations", () => {
  for (const value of INBOUND_OPERATIONS)
    assert.equal(isInboundOperation(value), true);
  for (const value of [
    "",
    "Read",
    "write",
    "run",
    "*",
    " read",
    1,
    null,
    undefined,
    {},
    ["read"],
    new String("read"),
  ]) {
    assert.equal(isInboundOperation(value), false, String(value));
  }
});
