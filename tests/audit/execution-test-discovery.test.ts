import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inspectStandardTestDiscoveryScript,
  STANDARD_TEST_DISCOVERY_INCLUDES_EXECUTION_RULE,
} from "../../src/audit/rules/audit.js";

describe("standard test discovery audit rule", () => {
  it("accepts the repository test script", () => {
    assert.equal(
      STANDARD_TEST_DISCOVERY_INCLUDES_EXECUTION_RULE.check().status,
      "pass",
    );
  });

  it("rejects scripts that omit src/execution tests", () => {
    assert.deepEqual(
      inspectStandardTestDiscoveryScript("tsx --test tests/**/*.test.ts"),
      {
        missing: ["src/execution/*.test.ts", "src/execution/**/*.test.ts"],
        duplicate: [],
      },
    );
  });

  it("rejects duplicate standard discovery globs", () => {
    assert.deepEqual(
      inspectStandardTestDiscoveryScript(
        "tsx --test tests/**/*.test.ts src/execution/*.test.ts src/execution/**/*.test.ts src/execution/**/*.test.ts",
      ),
      {
        missing: [],
        duplicate: ["src/execution/**/*.test.ts"],
      },
    );
  });
});
