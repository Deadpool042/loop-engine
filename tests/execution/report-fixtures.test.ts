import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { renderExecutionReport } from "../../src/execution/report.js";
import { executionFixture } from "../fixtures/execution-result.js";

describe("execution report fixtures", () => {
  const cases = [
    ["text", "report.txt"],
    ["markdown", "report.md"],
    ["json", "report.json"],
  ] as const;

  for (const [format, fixture] of cases) {
    it(`matches ${fixture}`, () => {
      const expected = readFileSync(
        `tests/fixtures/reports/${fixture}`,
        "utf8",
      );

      const actual = renderExecutionReport(executionFixture, { format });

      assert.equal(actual, expected);
    });
  }
});
