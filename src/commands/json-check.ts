import { execFileSync } from "node:child_process";

const COMMANDS = [
  ["summary", "--json"],
  ["context", "loop-engine", "--json"],
  ["next", "loop-engine", "--json"],
  ["prompt", "loop-engine", "--json"],
  ["review", "loop-engine", "--json"],
  ["handoff", "loop-engine", "--json"],
  ["rag-search", "roadmap", "--json"],
] as const;

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

      const json = JSON.parse(output);

      if (json.schemaVersion !== 1) {
        throw new Error("schemaVersion != 1");
      }

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
