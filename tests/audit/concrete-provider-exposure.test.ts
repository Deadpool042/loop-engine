import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONCRETE_PROVIDER_EXPOSURE_RULE,
  extractProviderModuleSpecifiers,
  inspectConcreteProviderExposure,
} from "../../src/audit/rules/concrete-provider-exposure.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const COMPOSITION_PATH = "src/commands/run.ts";

test("extractProviderModuleSpecifiers detects imports, exports and dynamic imports", () => {
  assert.deepEqual(
    extractProviderModuleSpecifiers(`
      import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";
      export { runtime } from "../runtime/codex.js";
      const provider = import("./codex-cli-executor.js");
    `),
    [
      "../loop/codex-cli-executor.js",
      "../runtime/codex.js",
      "./codex-cli-executor.js",
    ],
  );
});

test("allows concrete provider composition in the reviewed command boundary", () => {
  assert.deepEqual(
    inspectConcreteProviderExposure([
      {
        path: COMPOSITION_PATH,
        source:
          'import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";',
      },
    ]),
    [],
  );
});

test("rejects concrete provider exports from the Core public barrel", () => {
  assert.deepEqual(
    inspectConcreteProviderExposure([
      {
        path: "src/core/index.ts",
        source:
          'export { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";',
      },
    ]),
    [
      {
        path: "src/core/index.ts",
        target: "../loop/codex-cli-executor.js",
        reason: "concrete_provider_publicly_exposed",
      },
    ],
  );
});

test("rejects concrete Runtime providers from public barrels", () => {
  assert.deepEqual(
    inspectConcreteProviderExposure([
      {
        path: "src/runtime/index.ts",
        source: 'export * from "./codex.js";',
      },
    ]),
    [
      {
        path: "src/runtime/index.ts",
        target: "./codex.js",
        reason: "concrete_provider_publicly_exposed",
      },
    ],
  );
});

test("rejects concrete provider composition outside the reviewed boundary", () => {
  assert.deepEqual(
    inspectConcreteProviderExposure([
      {
        path: "src/core/provider-factory.ts",
        source:
          'const provider = import("../loop/codex-cli-executor.js");',
      },
    ]),
    [
      {
        path: "src/core/provider-factory.ts",
        target: "../loop/codex-cli-executor.js",
        reason: "unreviewed_provider_composition",
      },
    ],
  );
});

test("AUDIT-499 is registered and passes on the repository", () => {
  const registered = AUDIT_RULES.find((rule) => rule.id === "AUDIT-499");

  assert.ok(registered);
  assert.equal(registered.title, CONCRETE_PROVIDER_EXPOSURE_RULE.title);
  assert.equal(registered.check().status, "pass");
});
