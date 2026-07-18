import { generateRagSearchReport } from "../core/index.js";

export function runRagSearch(
  query: string | undefined,
  options?: { json?: boolean; limit?: number; pathPrefix?: string },
): void {
  const report = generateRagSearchReport(query, options);

  if (report.error === "missing_query") {
    if (options?.json) {
      console.log(JSON.stringify(report));
    } else {
      console.error("Usage: pnpm exec tsx src/cli.ts rag-search <query>");
    }
    process.exitCode = 1;
    return;
  }

  if (report.error === "missing_index") {
    if (options?.json) {
      console.log(JSON.stringify(report));
    } else {
      console.error(
        "Missing .loop-engine/rag-index.json. Run pnpm run rag-index first.",
      );
    }
    process.exitCode = 1;
    return;
  }

  if (options?.json) {
    console.log(JSON.stringify(report));
    return;
  }

  if (report.results.length === 0) {
    console.log(`No result for "${report.query}".`);
    return;
  }

  console.log(`Results for "${report.query}":`);
  for (const result of report.results) {
    const sectionLabel = result.sectionTitle ? ` — ${result.sectionTitle}` : "";
    console.log(
      `- ${result.path} — ${result.title}${sectionLabel} — score ${result.score}`,
    );
    if (result.snippet) console.log(`  ${result.snippet}`);
  }
}
