import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CLI_COMMAND_BOUNDARY_RULE,
  extractCliCommandModuleSpecifiers,
  inspectCliCommandBoundary,
} from "../../src/audit/rules/cli-command-boundary.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

test("extractCliCommandModuleSpecifiers detects imports, exports, and dynamic imports", () => {
  assert.deepEqual(
    extractCliCommandModuleSpecifiers(`
      import { run } from "../core/index.js";
      export { adapter } from "../loop/adapter.js";
      const policy = import("../policy/index.js");
    `),
    ["../core/index.js", "../loop/adapter.js", "../policy/index.js"],
  );
});

test("allows Core, UI, and local command dependencies", () => {
  assert.deepEqual(
    inspectCliCommandBoundary([
      {
        path: "src/commands/run.ts",
        source: `
          import { runLoop } from "../core/index.js";
          import { terminal } from "../ui/terminal.js";
          import { createProvider } from "./codex-provider.js";
        `,
      },
    ]),
    [],
  );
});

test("rejects direct internal layer imports from commands", () => {
  assert.deepEqual(
    inspectCliCommandBoundary([
      {
        path: "src/commands/run.ts",
        source: `
          import { execute } from "../loop/execute-runner.js";
          const policy = import("../policy/index.js");
        `,
      },
    ]),
    [
      {
        path: "src/commands/run.ts",
        target: "../loop/execute-runner.js",
        reason: "command_bypasses_core_boundary",
      },
      {
        path: "src/commands/run.ts",
        target: "../policy/index.js",
        reason: "command_bypasses_core_boundary",
      },
    ],
  );
});

test("allows the reviewed provider composition file", () => {
  assert.deepEqual(
    inspectCliCommandBoundary([
      {
        path: "src/commands/codex-provider.ts",
        source:
          'import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";',
      },
    ]),
    [],
  );
});

test("AUDIT-500 is registered and passes on the repository", () => {
  const registered = AUDIT_RULES.find((rule) => rule.id === "AUDIT-500");

  assert.ok(registered);
  assert.equal(registered.title, CLI_COMMAND_BOUNDARY_RULE.title);
  assert.equal(registered.check().status, "pass");
});
