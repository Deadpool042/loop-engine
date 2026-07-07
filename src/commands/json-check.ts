import { execFileSync } from "node:child_process";

const COMMANDS = [
  ["audit", "--json"],
  ["summary", "--json"],
  ["context", "loop-engine", "--json"],
  ["next", "loop-engine", "--json"],
  ["prompt", "loop-engine", "--json"],
  ["review", "loop-engine", "--json"],
  ["handoff", "loop-engine", "--json"],
  ["rag-search", "roadmap", "--json"],
] as const;

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected JSON object");
  }
}

function assertField(json: Record<string, unknown>, field: string): void {
  if (!(field in json)) {
    throw new Error(`missing field: ${field}`);
  }
}

function validatePayload(command: readonly string[], json: unknown): void {
  assertRecord(json);
  assertField(json, "schemaVersion");

  if (json.schemaVersion !== 1) {
    throw new Error("schemaVersion != 1");
  }

  const commandName = command[0];

  if (commandName === "audit") {
    assertField(json, "summary");
    assertField(json, "findings");
  } else if (commandName === "summary") {
    assertField(json, "projects");
  } else if (commandName === "context") {
    assertField(json, "project");
    assertField(json, "docs");
  } else if (commandName === "next") {
    assertField(json, "project");
    assertField(json, "roadmap");
  } else if (commandName === "prompt") {
    assertField(json, "project");
    assertField(json, "instructions");
  } else if (commandName === "review") {
    assertField(json, "project");
    assertField(json, "diffStat");
  } else if (commandName === "handoff") {
    assertField(json, "project");
    assertField(json, "instructions");
  } else if (commandName === "rag-search") {
    assertField(json, "query");
    assertField(json, "results");
  }
}

export function runJsonCheck(): void {
  execFileSync("pnpm", ["run", "rag-index"], { encoding: "utf8" });

  let failures = 0;

  for (const command of COMMANDS) {
    try {
      const output = execFileSync(
        "pnpm",
        ["exec", "tsx", "src/cli.ts", ...command],
        { encoding: "utf8" },
      );

      const json = JSON.parse(output) as unknown;

      validatePayload(command, json);

      console.log("✓", command.join(" "));
    } catch (error) {
      failures++;
      console.error("✗", command.join(" "));
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}
