import { generateRagIndex } from "../core/index.js";

export function runRagIndex(): void {
  const report = generateRagIndex();
  console.log(
    `Indexed ${report.documents.length} document(s) into .loop-engine/rag-index.json`,
  );
}
