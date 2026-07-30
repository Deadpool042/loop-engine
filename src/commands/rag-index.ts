import type { LoopApplicationAssembly } from "../composition/index.js";

export function runRagIndex(application: LoopApplicationAssembly): void {
  const report = application.generateRagIndex();
  console.log(
    `Indexed ${report.documents.length} document(s) into .loop-engine/rag-index.json`,
  );
}
