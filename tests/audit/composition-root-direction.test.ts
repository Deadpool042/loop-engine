import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMPOSITION_ROOT_DIRECTION_RULE,
  extractCompositionRootModuleSpecifiers,
  inspectCompositionRootDirection,
} from "../../src/audit/rules/composition-root-direction.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

test("extractCompositionRootModuleSpecifiers detects imports, exports, and dynamic imports", () => {
  assert.deepEqual(
    extractCompositionRootModuleSpecifiers(`
      import { core } from "../core/index.js";
      export { terminal } from "../ui/terminal.js";
      const audit = import("../audit/index.js");
    `),
    ["../core/index.js", "../ui/terminal.js", "../audit/index.js"],
  );
});

test("allows Core and infrastructure dependencies from composition", () => {
  assert.deepEqual(
    inspectCompositionRootDirection([
      {
        path: "src/composition/application-assembly.ts",
        source: `
          import type { LoopExecutor } from "../core/index.js";
          import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";
          import { CodexRuntime } from "../runtime/codex.js";
        `,
      },
    ]),
    [],
  );
});

test("rejects command, UI, and audit dependencies from composition", () => {
  assert.deepEqual(
    inspectCompositionRootDirection([
      {
        path: "src/composition/application.ts",
        source: `
          import { runLoopRunCommand } from "../commands/run.js";
          import { terminal } from "../ui/terminal.js";
          const audit = import("../audit/runtime-rules.js");
        `,
      },
    ]),
    [
      {
        path: "src/composition/application.ts",
        target: "../commands/run.js",
        reason: "composition_depends_on_inbound_layer",
      },
      {
        path: "src/composition/application.ts",
        target: "../ui/terminal.js",
        reason: "composition_depends_on_inbound_layer",
      },
      {
        path: "src/composition/application.ts",
        target: "../audit/runtime-rules.js",
        reason: "composition_depends_on_inbound_layer",
      },
    ],
  );
});

test("AUDIT-501 is registered and passes on the repository", () => {
  const registered = AUDIT_RULES.find((rule) => rule.id === "AUDIT-501");

  assert.ok(registered);
  assert.equal(registered.title, COMPOSITION_ROOT_DIRECTION_RULE.title);
  assert.equal(registered.check().status, "pass");
});
