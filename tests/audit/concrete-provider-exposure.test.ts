import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONCRETE_PROVIDER_EXPOSURE_RULE,
  extractProviderModuleSpecifiers,
  inspectConcreteProviderExposure,
} from "../../src/audit/rules/concrete-provider-exposure.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

const COMPOSITION_PATH = "src/composition/application-assembly.ts";

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

test("allows executable provider composition in the explicit composition root", () => {
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

test("allows deterministic Runtime stubs through the Runtime barrel", () => {
  assert.deepEqual(
    inspectConcreteProviderExposure([
      {
        path: "src/runtime/index.ts",
        source: 'export { CodexRuntime } from "./codex.js";',
      },
    ]),
    [],
  );
});

test("rejects executable provider exports from the Core public barrel", () => {
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

test("rejects executable provider composition outside the explicit root", () => {
  assert.deepEqual(
    inspectConcreteProviderExposure([
      {
        path: "src/commands/codex-provider.ts",
        source: 'const provider = import("../loop/codex-cli-executor.js");',
      },
    ]),
    [
      {
        path: "src/commands/codex-provider.ts",
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
