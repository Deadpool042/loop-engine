import { writeFileSync } from "node:fs";

import { executionFixture } from "../tests/fixtures/execution-result.js";
import { renderExecutionReport } from "../src/execution/index.js";

writeFileSync(
  "tests/fixtures/reports/report.txt",
  renderExecutionReport(executionFixture, { format: "text" }),
);

writeFileSync(
  "tests/fixtures/reports/report.md",
  renderExecutionReport(executionFixture, { format: "markdown" }),
);

writeFileSync(
  "tests/fixtures/reports/report.json",
  renderExecutionReport(executionFixture, { format: "json" }),
);
