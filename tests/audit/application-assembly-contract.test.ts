import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPLICATION_ASSEMBLY_CONTRACT_RULE,
  inspectApplicationAssemblyContract,
} from "../../src/audit/rules/application-assembly-contract.js";
import { AUDIT_RULES } from "../../src/audit/runtime-rules.js";

test("allows commands through assembly and concrete wiring inside the provider registry", () => {
  assert.deepEqual(
    inspectApplicationAssemblyContract(
      [
        {
          path: "src/commands/run.ts",
          source:
            'import type { LoopApplicationAssembly } from "../composition/application-assembly.js";',
        },
      ],
      [
        {
          path: "src/core/service.ts",
          source: 'import type { Port } from "../loop/execution.js";',
        },
      ],
      [
        {
          path: "src/composition/provider-registry.ts",
          source:
            'import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";',
        },
      ],
    ),
    [],
  );
});

test("rejects command bypasses, Core inversion, and provider wiring elsewhere", () => {
  assert.deepEqual(
    inspectApplicationAssemblyContract(
      [
        {
          path: "src/commands/run.ts",
          source: 'import { runLoop } from "../core/index.js";',
        },
      ],
      [
        {
          path: "src/core/service.ts",
          source:
            'import type { LoopApplicationAssembly } from "../composition/application-assembly.js";',
        },
      ],
      [
        {
          path: "src/cli-provider.ts",
          source:
            'import { createCodexCliLoopExecutor } from "../loop/codex-cli-executor.js";',
        },
      ],
    ),
    [
      {
        path: "src/commands/run.ts",
        target: "../core/index.js",
        reason: "command_bypasses_application_assembly",
      },
      {
        path: "src/core/service.ts",
        target: "../composition/application-assembly.js",
        reason: "core_depends_on_composition",
      },
      {
        path: "src/cli-provider.ts",
        target: "../loop/codex-cli-executor.js",
        reason: "concrete_provider_wired_outside_composition",
      },
    ],
  );
});

test("AUDIT-502 is registered and passes on the repository", () => {
  const registered = AUDIT_RULES.find((rule) => rule.id === "AUDIT-502");

  assert.ok(registered);
  assert.equal(registered.title, APPLICATION_ASSEMBLY_CONTRACT_RULE.title);
  assert.equal(registered.check().status, "pass");
});