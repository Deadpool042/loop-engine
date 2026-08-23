import type { LoopApplicationAssembly } from "../composition/index.js";

export function runRagIndex(application: LoopApplicationAssembly): void {
  try {
    const report = application.generateRagIndex();
    console.log(
      `Indexed ${report.documents.length} document(s) into .loop-engine/rag-index.json`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "rag-index failed unexpectedly.",
    );
    process.exitCode = 1;
  }
}
