export const PUBLIC_COMMANDS = [
  "audit",
  "summary",
  "context",
  "next",
  "prompt",
  "review",
  "handoff",
  "rag-search",
] as const;

export const PUBLIC_JSON_COMMAND_FILES = [
  "src/commands/summary.ts",
  "src/commands/context.ts",
  "src/commands/next.ts",
  "src/commands/prompt.ts",
  "src/commands/review.ts",
  "src/commands/handoff.ts",
  "src/commands/rag-search.ts",
] as const;
