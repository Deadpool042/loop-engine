import { readFileSync } from "node:fs";
import { fail, pass } from "../findings.js";
import { PUBLIC_COMMANDS } from "../public-commands.js";
import type { AuditRule } from "../types.js";

export const CLI_COMMAND_COVERAGE_RULE: AuditRule = {
  id: "CLI-001",
  category: "cli",
  severity: "error",
  title: "Public CLI commands are covered by the router",
  description: "Every public command should be reachable from the CLI router.",
  check: () => {
    const content = readFileSync("src/cli.ts", "utf8");

    const expectedCommands = PUBLIC_COMMANDS;

    const missing = expectedCommands.filter(
      (command) => !content.includes(`"${command}"`) && !content.includes(`'${command}'`),
    );

    if (missing.length > 0) {
      return fail(
        CLI_COMMAND_COVERAGE_RULE,
        "Some public CLI commands are missing from the router.",
        missing,
      );
    }

    return pass(
      CLI_COMMAND_COVERAGE_RULE,
      "All public CLI commands are covered by the router.",
      expectedCommands,
    );
  },
};
