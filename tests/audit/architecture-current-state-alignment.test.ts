import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const RFC_PATH = "docs/architecture/execution-architecture-rfc.md";
const README_PATH = "README.md";
const PACKAGE_PATH = "package.json";

type PackageJson = Readonly<{
  scripts?: Readonly<Record<string, string>>;
}>;

describe("current architecture documentation alignment", () => {
  it("documents the delivered V14.3 execution slice", () => {
    const content = readFileSync(RFC_PATH, "utf8");
    const normalizedContent = content.replace(/\s+/g, " ");

    for (const expected of [
      "Current implementation status — V14.3",
      "executePreparedInboundRuntimeRequest(...)",
      "trusted execution-context resolution",
      "dry-run plan OR one bounded Runtime invocation",
      "V14.3 preserves this rule",
      "Operational V14.3 boundary",
      "V14.3 vertical slice",
    ]) {
      assert.ok(
        normalizedContent.includes(expected),
        `Missing current-state term: ${expected}`,
      );
    }

    for (const obsoleteClaim of [
      "The execution boundary is not implemented.",
      "it does not exist in this architecture.",
      "No current implementation MAY transition to `Crossed`, `Executed`, or `Completed`.",
      "V13.0 therefore leaves the pipeline at a declarative stop.",
    ]) {
      assert.equal(
        normalizedContent.includes(obsoleteClaim),
        false,
        `Obsolete current-state claim remains: ${obsoleteClaim}`,
      );
    }
  });

  it("keeps the documented report fixture command executable", () => {
    const readme = readFileSync(README_PATH, "utf8");
    const packageJson = JSON.parse(
      readFileSync(PACKAGE_PATH, "utf8"),
    ) as PackageJson;
    const scripts = packageJson.scripts ?? {};

    assert.ok(readme.includes("pnpm run reports:fixtures"));
    assert.equal(
      scripts["generate:report-fixtures"],
      "tsx scripts/generate-report-fixtures.ts",
    );
    assert.equal(
      scripts["reports:fixtures"],
      "pnpm run generate:report-fixtures",
    );
  });
});
