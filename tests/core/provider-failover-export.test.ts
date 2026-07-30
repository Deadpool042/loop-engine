import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createProviderFailoverLoopExecutor,
  executeLoopProviderFailover,
  LOOP_PROVIDER_FAILOVER_SCHEMA_VERSION,
} from "../../src/core/index.js";

test("Core exposes the provider failover orchestration boundary", () => {
  assert.equal(typeof createProviderFailoverLoopExecutor, "function");
  assert.equal(typeof executeLoopProviderFailover, "function");
  assert.equal(LOOP_PROVIDER_FAILOVER_SCHEMA_VERSION, 1);
});
