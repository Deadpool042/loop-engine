import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PREPARED_INBOUND_RUNTIME_EXECUTION_FAILURE_REASONS,
  PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION,
  executePreparedInboundRuntimeRequest,
} from "../../src/core/index.js";

describe("prepared inbound Runtime public Core API", () => {
  it("exports the versioned application service and stable failure inventory", () => {
    assert.equal(typeof executePreparedInboundRuntimeRequest, "function");
    assert.equal(PREPARED_INBOUND_RUNTIME_EXECUTION_SCHEMA_VERSION, 1);
    assert.deepEqual(PREPARED_INBOUND_RUNTIME_EXECUTION_FAILURE_REASONS, [
      "execution_context_unavailable",
      "execution_context_invalid",
      "runtime_unavailable",
      "runtime_execution_failed",
      "runtime_result_invalid",
    ]);
  });
});
